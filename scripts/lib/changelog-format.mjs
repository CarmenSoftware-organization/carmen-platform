export const CATEGORY_ORDER = ['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security'];

const HEADER = `# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com),
and this project adheres to [Semantic Versioning](https://semver.org).

<!-- Generated from src/data/changelog.json — do not edit by hand. -->
`;

export function hasChanges(changes) {
  return CATEGORY_ORDER.some((cat) => changes?.[cat]?.length);
}

function renderChanges(changes) {
  return CATEGORY_ORDER
    .filter((cat) => changes?.[cat]?.length)
    .map((cat) => `### ${cat}\n${changes[cat].map((item) => `- ${item}`).join('\n')}`)
    .join('\n\n');
}

export function renderMarkdown(changelog) {
  if (!changelog || !Array.isArray(changelog.versions)) {
    throw new TypeError('renderMarkdown: changelog must be a validated object with a versions array');
  }
  const sections = [];
  if (hasChanges(changelog.unreleased)) {
    sections.push(`## [Unreleased]\n\n${renderChanges(changelog.unreleased)}`);
  }
  for (const v of changelog.versions) {
    sections.push(`## [${v.version}] - ${v.date}\n\n${renderChanges(v.changes)}`);
  }
  return `${HEADER}\n${sections.join('\n\n')}\n`;
}

export function validateChangelog(changelog) {
  if (!changelog || typeof changelog !== 'object') return ['Root must be an object.'];
  const errors = [];
  if (!Array.isArray(changelog.versions)) {
    errors.push('"versions" must be an array.');
  } else {
    changelog.versions.forEach((v, i) => {
      if (!v || !v.version) errors.push(`versions[${i}] is missing "version".`);
      if (!v || !v.date) errors.push(`versions[${i}] is missing "date".`);
      if (v && v.changes !== undefined && (typeof v.changes !== 'object' || v.changes === null || Array.isArray(v.changes))) {
        errors.push(`versions[${i}] "changes" must be an object.`);
      }
    });
  }
  return errors;
}

export function nextVersion(current, level = 'patch') {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(current);
  if (!match) throw new Error(`Invalid semver: "${current}"`);
  let [major, minor, patch] = match.slice(1).map(Number);
  if (level === 'major') { major += 1; minor = 0; patch = 0; }
  else if (level === 'minor') { minor += 1; patch = 0; }
  else if (level === 'patch') { patch += 1; }
  else throw new Error(`Invalid bump level: "${level}" (expected patch|minor|major)`);
  return `${major}.${minor}.${patch}`;
}

export function promoteUnreleased(changelog, level, today) {
  if (!hasChanges(changelog.unreleased)) {
    throw new Error('Nothing to release: "unreleased" is empty.');
  }
  const current = changelog.versions[0]?.version ?? '0.0.0';
  const version = nextVersion(current, level);
  return {
    unreleased: {},
    versions: [
      { version, date: today, changes: changelog.unreleased },
      ...changelog.versions,
    ],
  };
}
