import type { TFunction } from '../../i18n/types';
import type { DialogWarning } from '../../utils/dialogXml';

export function warningText(w: DialogWarning, t: TFunction): string {
  switch (w.code) {
    case 'colsInvalid':
      return t('components.dialogPreview.warnColsInvalid', { raw: w.raw, used: w.used });
    case 'colsClamped':
      return t('components.dialogPreview.warnColsClamped', { raw: w.raw, used: w.used });
    case 'colSpanInvalid':
      return t('components.dialogPreview.warnColSpanInvalid', { raw: w.raw, used: w.used, at: w.at });
    case 'colSpanClamped':
      return t('components.dialogPreview.warnColSpanClamped', { raw: w.raw, used: w.used, at: w.at });
    case 'colSpanOnLabel':
      return t('components.dialogPreview.warnColSpanOnLabel', { at: w.at });
    case 'unknownElement':
      return t('components.dialogPreview.warnUnknownElement', { at: w.at, tag: w.tag });
    case 'nestedGroupFlattened':
      return t('components.dialogPreview.warnNestedGroup', { at: w.at });
    case 'emptyGroup':
      return t('components.dialogPreview.warnEmptyGroup', { at: w.at });
    case 'labelWithoutControl':
      return t('components.dialogPreview.warnLabelWithoutControl', { at: w.at });
    case 'controlWithoutLabel':
      return t('components.dialogPreview.warnControlWithoutLabel', { at: w.at });
    case 'emptyLabel':
      return t('components.dialogPreview.warnEmptyLabel', { at: w.at });
  }
}
