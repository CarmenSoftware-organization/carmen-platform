import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeatureMatrixCard } from './FeatureMatrixCard';
import { toFeaturesPayload } from './featureSelection';
import subscriptionService from '../../services/subscriptionService';
import type { BusinessUnit, LicenseFeature, SubscriptionBu } from '../../types';

vi.mock('../../services/subscriptionService', () => ({
  default: { getFeatureCatalog: vi.fn() },
}));

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const catalog: LicenseFeature[] = [
  { key: 'procurement', parent_key: null, label: 'Procurement', description: null, sort_order: 0 },
  { key: 'procurement.purchase_request', parent_key: 'procurement', label: 'Purchase Request', description: null, sort_order: 0 },
  { key: 'procurement.purchase_order', parent_key: 'procurement', label: 'Purchase Order', description: null, sort_order: 1 },
  { key: 'inventory', parent_key: null, label: 'Inventory', description: null, sort_order: 1 },
  { key: 'inventory.stock_count', parent_key: 'inventory', label: 'Stock Count', description: null, sort_order: 0 },
];

const bu = (over: Partial<SubscriptionBu> = {}): SubscriptionBu => ({
  business_unit_id: 'bu1',
  bu_code: 'BU1',
  bu_name: 'Acme BU',
  feature_keys: [],
  licensed_users: 10,
  ...over,
});

const businessUnit = (over: Partial<BusinessUnit> = {}): BusinessUnit => ({
  id: 'bu1',
  code: 'BU1',
  name: 'Acme BU',
  is_active: true,
  ...over,
});

// Controlled-component harness — mirrors how SubscriptionEdit holds `bus` state and passes
// `onChange={setBus}` down. FeatureMatrixCard itself never owns `bus`.
function Harness({
  initialBus,
  clusterBus,
  readOnly = false,
}: {
  initialBus: SubscriptionBu[];
  clusterBus: BusinessUnit[];
  readOnly?: boolean;
}) {
  const [bus, setBus] = useState(initialBus);
  return <FeatureMatrixCard bus={bus} clusterBus={clusterBus} onChange={setBus} readOnly={readOnly} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  asMock(subscriptionService.getFeatureCatalog).mockResolvedValue({ data: catalog });
});

describe('FeatureMatrixCard — catalog fails to load', () => {
  it('blocks all editing (no checkboxes, no BU controls) and offers a retry', async () => {
    asMock(subscriptionService.getFeatureCatalog).mockRejectedValueOnce(new Error('network'));
    render(<Harness initialBus={[bu()]} clusterBus={[businessUnit()]} />);

    expect(await screen.findByText('โหลดรายการสิทธิ์ไม่สำเร็จ')).toBeInTheDocument();
    // Nothing that could mutate `bus` renders at all — this is what prevents a Save from ever
    // replacing feature_keys with an empty set (setFeatures is replace semantics).
    expect(screen.queryByText('Acme BU')).toBeNull();
    expect(screen.queryByRole('button', { name: 'ทั้งหมด' })).toBeNull();
    expect(screen.queryByLabelText('เลือกหน่วยธุรกิจที่จะเพิ่ม')).toBeNull();

    asMock(subscriptionService.getFeatureCatalog).mockResolvedValueOnce({ data: catalog });
    await userEvent.setup().click(screen.getByRole('button', { name: 'ลองใหม่' }));
    expect(await screen.findByText('Acme BU')).toBeInTheDocument();
  });
});

describe('FeatureMatrixCard — checking a child checks its module parent', () => {
  it('auto-checks the module badge once the first child is checked', async () => {
    const user = userEvent.setup();
    render(<Harness initialBus={[bu({ feature_keys: [] })]} clusterBus={[businessUnit()]} />);
    await screen.findByText('Acme BU');

    expect(screen.getByText('0/2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Procurement/ })); // expand
    await user.click(screen.getByRole('button', { name: 'Purchase Request' }));

    expect(screen.getByText('1/2')).toBeInTheDocument();
  });
});

describe('FeatureMatrixCard — unchecking the last child drops the parent module too', () => {
  it('goes from 1/2 back to 0/2 when the only checked child is unchecked', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initialBus={[bu({ feature_keys: ['procurement', 'procurement.purchase_request'] })]}
        clusterBus={[businessUnit()]}
      />,
    );
    await screen.findByText('Acme BU');
    expect(screen.getByText('1/2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Procurement/ }));
    await user.click(screen.getByRole('button', { name: 'Purchase Request' }));

    expect(screen.getByText('0/2')).toBeInTheDocument();
  });

  it('keeps the module checked when a sibling child is still selected', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initialBus={[
          bu({ feature_keys: ['procurement', 'procurement.purchase_request', 'procurement.purchase_order'] }),
        ]}
        clusterBus={[businessUnit()]}
      />,
    );
    await screen.findByText('Acme BU');
    await user.click(screen.getByRole('button', { name: /^Procurement/ }));
    await user.click(screen.getByRole('button', { name: 'Purchase Request' }));

    expect(screen.getByText('1/2')).toBeInTheDocument();
  });
});

describe('FeatureMatrixCard — module "ทั้งหมด / ไม่เอา" bulk buttons', () => {
  it('ทั้งหมด selects every child + module; ไม่เอา clears them all', async () => {
    const user = userEvent.setup();
    render(<Harness initialBus={[bu({ feature_keys: [] })]} clusterBus={[businessUnit()]} />);
    await screen.findByText('Acme BU');

    await user.click(screen.getByRole('button', { name: 'เอาทั้งหมดใน Procurement' }));
    expect(screen.getByText('2/2')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'ไม่เอาทั้งหมดใน Procurement' }));
    expect(screen.getByText('0/2')).toBeInTheDocument();
  });
});

describe('FeatureMatrixCard — search filters and auto-expands matches', () => {
  it('shows a matching child without a manual expand click, and hides non-matching modules', async () => {
    const user = userEvent.setup();
    render(<Harness initialBus={[bu()]} clusterBus={[businessUnit()]} />);
    await screen.findByText('Acme BU');

    await user.type(screen.getByLabelText('ค้นหาสิทธิ์'), 'stock count');

    expect(screen.getByText('Stock Count')).toBeInTheDocument();
    expect(screen.queryByText('Purchase Request')).toBeNull();
    expect(screen.queryByText('Procurement')).toBeNull();
  });
});

describe('FeatureMatrixCard — remove a BU from the contract', () => {
  it('requires confirming (never window.confirm) before removing, then re-selects a remaining BU', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const user = userEvent.setup();
    const bus = [
      bu({ business_unit_id: 'bu1', bu_name: 'Acme BU' }),
      bu({ business_unit_id: 'bu2', bu_code: 'BU2', bu_name: 'Beta BU' }),
    ];
    const clusterBus = [businessUnit({ id: 'bu1' }), businessUnit({ id: 'bu2', code: 'BU2', name: 'Beta BU' })];
    render(<Harness initialBus={bus} clusterBus={clusterBus} />);
    await screen.findByText('Acme BU');

    await user.click(screen.getByRole('button', { name: 'ถอด Acme BU ออกจากสัญญา' }));
    const dialog = await screen.findByRole('dialog');
    expect(confirmSpy).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'ถอดออก' }));

    await waitFor(() => expect(screen.queryByText('Acme BU')).toBeNull());
    // The remaining BU (Beta) becomes selected — never a dangling reference to the removed one.
    expect(screen.getByText('Beta BU')).toBeInTheDocument();
    confirmSpy.mockRestore();
  });

  it('is not gated by clicking the row itself — the tab stays until confirmed', async () => {
    const user = userEvent.setup();
    render(<Harness initialBus={[bu()]} clusterBus={[businessUnit()]} />);
    await screen.findByText('Acme BU');

    await user.click(screen.getByRole('button', { name: 'ถอด Acme BU ออกจากสัญญา' }));
    await screen.findByRole('dialog');
    // Closing without confirming (e.g. Cancel) must leave the BU in place.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Acme BU')).toBeInTheDocument();
  });
});

describe('FeatureMatrixCard — copy features from another BU', () => {
  it('requires confirming, then replaces (not merges) the target feature_keys', async () => {
    const user = userEvent.setup();
    const bus = [
      bu({ business_unit_id: 'bu1', bu_name: 'Acme BU', feature_keys: ['inventory', 'inventory.stock_count'] }),
      bu({
        business_unit_id: 'bu2',
        bu_code: 'BU2',
        bu_name: 'Beta BU',
        feature_keys: ['procurement', 'procurement.purchase_order'],
      }),
    ];
    const clusterBus = [businessUnit({ id: 'bu1' }), businessUnit({ id: 'bu2', code: 'BU2', name: 'Beta BU' })];
    render(<Harness initialBus={bus} clusterBus={clusterBus} />);
    await screen.findByText('Acme BU');

    // Acme (selected by default) starts with inventory checked, procurement not.
    expect(screen.getByText('0/2')).toBeInTheDocument(); // Procurement
    expect(screen.getByText('1/1')).toBeInTheDocument(); // Inventory

    await user.selectOptions(screen.getByLabelText('คัดลอกสิทธิ์จากหน่วยธุรกิจ'), 'bu2');
    await user.click(screen.getByRole('button', { name: 'คัดลอก' }));

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'คัดลอก' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('คัดลอกสิทธิ์จาก Beta BU แล้ว'));
    // Replaced wholesale: Procurement now matches Beta's set, Inventory is cleared — not merged.
    expect(screen.getByText('1/2')).toBeInTheDocument(); // Procurement now has purchase_order
    expect(screen.getByText('0/1')).toBeInTheDocument(); // Inventory cleared
  });
});

describe('FeatureMatrixCard — add a BU to the contract', () => {
  it('adds the picked BU with no features yet and selects it', async () => {
    const user = userEvent.setup();
    const clusterBus = [businessUnit({ id: 'bu1' }), businessUnit({ id: 'bu2', code: 'BU2', name: 'Beta BU', max_license_users: 5 })];
    render(<Harness initialBus={[bu()]} clusterBus={clusterBus} />);
    await screen.findByText('Acme BU');

    await user.selectOptions(screen.getByLabelText('เลือกหน่วยธุรกิจที่จะเพิ่ม'), 'bu2');
    await user.click(screen.getByRole('button', { name: 'เพิ่ม' }));

    expect(await screen.findByText('Beta BU')).toBeInTheDocument();
  });
});

describe('FeatureMatrixCard — no BUs on the contract yet', () => {
  it('prompts to add one from the full cluster roster; the add button is disabled until picked', async () => {
    const user = userEvent.setup();
    render(<Harness initialBus={[]} clusterBus={[businessUnit()]} />);

    expect(await screen.findByText(/ยังไม่มีหน่วยธุรกิจในสัญญานี้/)).toBeInTheDocument();
    const addButton = screen.getByRole('button', { name: 'เพิ่มหน่วยธุรกิจ' });
    expect(addButton).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('เลือกหน่วยธุรกิจที่จะเพิ่ม'), 'bu1');
    expect(addButton).not.toBeDisabled();
    await user.click(addButton);

    expect(await screen.findByText('Acme BU')).toBeInTheDocument();
  });

  it('read-only mode shows a plain message with no controls at all', async () => {
    render(<Harness initialBus={[]} clusterBus={[]} readOnly />);
    expect(await screen.findByText('ยังไม่มีหน่วยธุรกิจในสัญญานี้')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});

describe('FeatureMatrixCard — read-only mode with an existing selection', () => {
  it('shows selected features grouped by module with no checkbox, All/None, copy, or add/remove controls', async () => {
    const bus = [bu({ feature_keys: ['procurement', 'procurement.purchase_request'] })];
    render(<Harness initialBus={bus} clusterBus={[businessUnit()]} readOnly />);
    await screen.findByText('Acme BU');

    expect(screen.getByText('Purchase Request')).toBeInTheDocument();
    // Rendered as a read-only Badge, not an interactive toggle.
    expect(screen.queryByRole('button', { name: 'Purchase Request' })).toBeNull();
    expect(screen.queryByRole('button', { name: /ทั้งหมด/ })).toBeNull();
    expect(screen.queryByLabelText('คัดลอกสิทธิ์จากหน่วยธุรกิจ')).toBeNull();
    expect(screen.queryByLabelText('เลือกหน่วยธุรกิจที่จะเพิ่ม')).toBeNull();
    expect(screen.queryByLabelText(/ถอด .* ออกจากสัญญา/)).toBeNull();
    expect(screen.queryByLabelText('ค้นหาสิทธิ์')).toBeNull();
  });

  it('shows a plain message when the selected BU has no features assigned', async () => {
    render(<Harness initialBus={[bu({ feature_keys: [] })]} clusterBus={[businessUnit()]} readOnly />);
    expect(await screen.findByText('ไม่มีสิทธิ์ที่กำหนดให้ Acme BU')).toBeInTheDocument();
  });
});

// Renders exactly what a Save would PUT, so a test can prove a key really left the payload
// rather than merely leaving the screen.
function PayloadHarness({
  initialBus,
  clusterBus,
  readOnly = false,
}: {
  initialBus: SubscriptionBu[];
  clusterBus: BusinessUnit[];
  readOnly?: boolean;
}) {
  const [bus, setBus] = useState(initialBus);
  return (
    <>
      <FeatureMatrixCard bus={bus} clusterBus={clusterBus} onChange={setBus} readOnly={readOnly} />
      <pre data-testid="payload">{JSON.stringify(toFeaturesPayload(bus))}</pre>
    </>
  );
}

// Review I3: the catalog only carries `is_active: true` rows, but `bus[].feature_keys` came
// straight from the contract. A feature switched off afterwards vanished from both UI modes
// while `toFeaturesPayload` kept shipping it — backend 422 "feature key ที่ไม่รู้จัก", parsed by
// the generic branch, redacted in production to "Please try again later.", with no control
// anywhere to remove the offending key. Show it, and let the user take it off deliberately.
describe('FeatureMatrixCard — feature keys missing from the catalog', () => {
  const withDeadKeys = () => [
    bu({ feature_keys: ['procurement', 'procurement.purchase_request', 'legacy.dead', 'ghost'] }),
  ];

  it('lists them under "ไม่รู้จัก (ถูกปิดใช้งาน)" instead of hiding them', async () => {
    render(<PayloadHarness initialBus={withDeadKeys()} clusterBus={[businessUnit()]} />);
    await screen.findByText('Acme BU');

    expect(screen.getByText(/ไม่รู้จัก \(ถูกปิดใช้งาน\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ถอดสิทธิ์ที่ไม่รู้จัก legacy.dead' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ถอดสิทธิ์ที่ไม่รู้จัก ghost' })).toBeInTheDocument();
  });

  it('does not remove them on its own — the payload still carries them until the user acts', async () => {
    render(<PayloadHarness initialBus={withDeadKeys()} clusterBus={[businessUnit()]} />);
    await screen.findByText('Acme BU');

    expect(JSON.parse(screen.getByTestId('payload').textContent!)[0].feature_keys)
      .toContain('legacy.dead');
  });

  it('drops the key from the payload once its ถอด button is clicked, leaving the rest intact', async () => {
    const user = userEvent.setup();
    render(<PayloadHarness initialBus={withDeadKeys()} clusterBus={[businessUnit()]} />);
    await screen.findByText('Acme BU');

    await user.click(screen.getByRole('button', { name: 'ถอดสิทธิ์ที่ไม่รู้จัก legacy.dead' }));

    const keys = JSON.parse(screen.getByTestId('payload').textContent!)[0].feature_keys;
    expect(keys).not.toContain('legacy.dead');
    // Removing a dead child must not take its (still real) module down with it, and must not
    // touch the other dead key either.
    expect(keys).toEqual(['procurement', 'procurement.purchase_request', 'ghost']);
    expect(screen.queryByRole('button', { name: 'ถอดสิทธิ์ที่ไม่รู้จัก legacy.dead' })).toBeNull();
  });

  it('shows nothing extra when every key is in the catalog', async () => {
    render(
      <PayloadHarness
        initialBus={[bu({ feature_keys: ['procurement', 'procurement.purchase_request'] })]}
        clusterBus={[businessUnit()]}
      />,
    );
    await screen.findByText('Acme BU');

    expect(screen.queryByText(/ไม่รู้จัก \(ถูกปิดใช้งาน\)/)).toBeNull();
  });

  it('read-only mode shows them with no remove button at all', async () => {
    render(<PayloadHarness initialBus={withDeadKeys()} clusterBus={[businessUnit()]} readOnly />);
    await screen.findByText('Acme BU');

    expect(screen.getByText(/ไม่รู้จัก \(ถูกปิดใช้งาน\)/)).toBeInTheDocument();
    expect(screen.getByText('legacy.dead')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ถอดสิทธิ์ที่ไม่รู้จัก/ })).toBeNull();
  });

  it('read-only mode shows them even when the BU has no catalog feature left', async () => {
    render(
      <PayloadHarness
        initialBus={[bu({ feature_keys: ['ghost'] })]}
        clusterBus={[businessUnit()]}
        readOnly
      />,
    );
    await screen.findByText('Acme BU');

    // Not the "ไม่มีสิทธิ์ที่กำหนดให้" message — the contract does hold something, it is just dead.
    expect(screen.getByText(/ไม่รู้จัก \(ถูกปิดใช้งาน\)/)).toBeInTheDocument();
    expect(screen.queryByText('ไม่มีสิทธิ์ที่กำหนดให้ Acme BU')).toBeNull();
  });
});

// Review M5: selecting one child showed "2 รายการที่เลือก" because the module key that
// `toggleFeature` adds automatically was counted too — directly contradicting the 1/2 badge
// rendered a few pixels above it.
describe('FeatureMatrixCard — the "N รายการที่เลือก" counter counts children only', () => {
  it('says 1 after one child is checked, matching the module badge', async () => {
    const user = userEvent.setup();
    render(<Harness initialBus={[bu({ feature_keys: [] })]} clusterBus={[businessUnit()]} />);
    await screen.findByText('Acme BU');

    expect(screen.getByText('0 รายการที่เลือก')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Procurement/ }));
    await user.click(screen.getByRole('button', { name: 'Purchase Request' }));

    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('1 รายการที่เลือก')).toBeInTheDocument();
  });

  it('counts children across modules and ignores keys missing from the catalog', async () => {
    render(
      <Harness
        initialBus={[bu({
          feature_keys: ['procurement', 'procurement.purchase_request', 'inventory', 'inventory.stock_count', 'ghost'],
        })]}
        clusterBus={[businessUnit()]}
      />,
    );
    await screen.findByText('Acme BU');

    expect(screen.getByText('2 รายการที่เลือก')).toBeInTheDocument();
  });
});
