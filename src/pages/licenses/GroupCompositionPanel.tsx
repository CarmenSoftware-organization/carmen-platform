import { AlertTriangle } from 'lucide-react';
import { FeatureCompositionBar } from './FeatureCompositionBar';
import { useI18n } from '../../hooks/useI18n';
import { cn } from '../../lib/utils';

export interface GroupCompositionPanelProps {
  /** สิทธิ์ที่ผู้ใช้ติ๊กเอง — ลูกล้วน (`selectedChildCount`) */
  childCount: number;
  /** module แม่ที่ถูกเติมให้ตามกฎ "ลูกลากพ่อ" (`selectedModuleCount`) */
  moduleCount: number;
  /** ขนาดแค็ตตาล็อก = ตัวหารร่วมกับหน้ารายการ · `null` = โหลดไม่ได้ → ไม่วาดแถบ */
  catalogTotal: number | null;
  subscriptionCount: number;
  /** ผู้ใช้กำลังจะปิดกลุ่มที่ *เปิดอยู่* เท่านั้น — ไม่ใช่ทุกครั้งที่เปิดหน้ากลุ่มที่ปิดไว้แล้ว */
  willDeactivate: boolean;
}

/**
 * ชุดสิทธิ์นี้กินแค็ตตาล็อกไปเท่าไร และใครโดนบ้างถ้าแก้
 *
 * **แกนร่วมต้องตามเข้ามาถึงหน้าแก้ไข** หน้ารายการลงทุนทำ `FeatureCompositionBar` ให้ทุกชุดวัดกับ
 * ตัวหารเดียวกัน (ขนาดแค็ตตาล็อก) นั่นคือสิ่งที่ทำให้เทียบชุดข้ามแถวได้ — แล้วพอคลิกเข้ามาแก้
 * แกนนั้นเคยหายเกลี้ยง เหลือแค่ประโยค 12px สีจางที่ก้นหน้า ใต้กล่องเลื่อนซ้อนที่บังมันอยู่ครึ่งบรรทัด
 * ทั้งที่ตัวเลขนั้นคือสิ่งที่นิยามว่าชุดนี้เป็นชุดอะไร แผงนี้เอามันขึ้นมาไว้บนสุดในแกนเดิม
 *
 * **ตัวเลขสามตัวกระทบยอดกันในบล็อกเดียว** `33 = 27 + 6` — เดิม 27 อยู่หน้านี้ ส่วน 33 (คือ
 * `feature_count`) อยู่หน้ารายการ ต่างกัน 6 โดยไม่มีที่ไหนอธิบาย ตัวใหญ่คือ **ยอดที่บันทึกจริง**
 * ไม่ใช่ยอดที่ติ๊ก เพราะยอดที่บันทึกจริงคือยอดที่ลูกค้าได้ และเป็นยอดเดียวกับที่หน้ารายการโชว์
 *
 * **รัศมีความเสียหายอยู่ติดกับสิ่งที่มันวัด** จำนวนสัญญาเคยเป็นแถบส้มเต็มความกว้างเหนือฟอร์ม
 * ครึ่งขวาว่างเปล่า ดังกว่าทุกอย่างในหน้ารวมทั้งของที่กำลังถูกแก้ · มันสำคัญจริง แต่ความสำคัญ
 * ของมันคือ "ตัวเลขนี้คูณกับทุกการเปลี่ยนแปลงข้างล่าง" ซึ่งอ่านออกก็ต่อเมื่ออยู่ข้าง ๆ ตัวเลขนั้น
 */
export function GroupCompositionPanel({
  childCount,
  moduleCount,
  catalogTotal,
  subscriptionCount,
  willDeactivate,
}: GroupCompositionPanelProps) {
  const { t } = useI18n();

  // ยอดที่ backend เก็บจริง = ลูก + แม่ที่ถูกเติม — ตัวเดียวกับ `feature_count` บนหน้ารายการ
  const saved = childCount + moduleCount;
  /**
   * ตัวหารใช้ได้ก็ต่อเมื่อโหลดแค็ตตาล็อกสำเร็จ **และ** ยอดไม่เกินมัน
   *
   * ที่นี่ `saved` นับจากแค็ตตาล็อกก้อนเดียวกับตัวหาร คีย์ที่หลุดจากแค็ตตาล็อกไม่ถูกนับ
   * (บล็อก "ไม่รู้จัก" ในตัวเลือกนับให้ต่างหาก) เศษส่วนเกิน 1 จึงเป็นไปไม่ได้ตามโครงสร้าง —
   * แต่เงื่อนไขยังอยู่ เพราะกฎที่หน้ารายการจ่ายค่าเรียนไปแล้วคือ "ตกไปใช้ตัวเลขเปล่าดีกว่า
   * แสดงเศษส่วนที่เป็นไปไม่ได้" และมันต้องจริงในทุกหน้าที่วาดแถบนี้ ไม่ใช่เฉพาะหน้าที่พังมาก่อน
   */
  const usableTotal = catalogTotal !== null && saved <= catalogTotal ? catalogTotal : null;

  const barLabel =
    usableTotal !== null
      ? t('pages.licenseFeatureGroups.featuresOfTotal', { count: saved, total: usableTotal })
      : t('pages.licenseFeatureGroups.featuresOnly', { count: saved });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-muted-foreground text-xs">
          {t('pages.licenseFeatureGroups.compositionTitle')}
        </p>
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              'text-3xl leading-none font-semibold tabular-nums',
              saved === 0 && 'text-muted-foreground/60',
            )}
          >
            {saved}
          </span>
          <span className="text-muted-foreground text-sm">
            {usableTotal !== null
              ? t('pages.licenseFeatureGroups.compositionOfCatalog', { total: usableTotal })
              : t('pages.licenseFeatureGroups.compositionNoDenominator')}
          </span>
        </div>

        {/* ไม่มีตัวหาร = ไม่มีแถบ ความยาวที่ไม่มีแกนคือความยาวที่เปลี่ยนความหมายเองได้เงียบ ๆ */}
        {usableTotal !== null && (
          <FeatureCompositionBar count={saved} total={usableTotal} label={barLabel} />
        )}

        <p className="text-muted-foreground text-xs">
          {saved === 0
            ? t('pages.licenseFeatureGroups.compositionEmpty')
            : t('pages.licenseFeatureGroups.compositionBreakdown', {
                children: childCount,
                modules: moduleCount,
              })}
        </p>
      </div>

      {/* รัศมีความเสียหาย — ที่นี่คือจุดที่การกระทำเกิดจริง: ทุกสัญญาที่ผูกกลุ่มนี้ได้สิทธิ์ตามชุด
          ที่บันทึกไว้ ณ เวลาที่อ่าน ไม่ใช่ตามชุดที่มันซื้อไป การถอด feature ออกหนึ่งตัวจึงถอดออกจาก
          ทุกสัญญาพร้อมกัน ไม่มีขั้นยืนยันอื่น */}
      {subscriptionCount > 0 && (
        <div className="border-warning/40 bg-warning/5 space-y-1 rounded-md border p-3">
          <p className="flex items-start gap-2 text-sm font-medium">
            <AlertTriangle className="text-warning mt-0.5 h-4 w-4 shrink-0" />
            {subscriptionCount === 1
              ? t('pages.licenseFeatureGroups.inUseWarningTitleOne')
              : t('pages.licenseFeatureGroups.inUseWarningTitle', { count: subscriptionCount })}
          </p>
          <p className="text-muted-foreground pl-6 text-xs">
            {t('pages.licenseFeatureGroups.inUseWarningBody')}
          </p>
          {/* `invisible` ไม่ใช่การถอดออกจาก DOM: ถ้าบรรทัดนี้งอกออกมาตอนกดสลับสถานะ กล่องจะสูงขึ้น
              แล้วดันทุกอย่างใต้มันลง สวิตช์เลื่อนหนีนิ้วในจังหวะที่เพิ่งกดพอดี (ยืนยันในเบราว์เซอร์
              แล้วตั้งแต่ตอนยังเป็น checkbox — คลิกครั้งที่สองที่พิกัดเดิมพลาดเป้า) */}
          <p
            aria-hidden={!willDeactivate}
            className={cn(
              'text-warning pl-6 text-xs font-medium',
              willDeactivate ? 'visible' : 'invisible',
            )}
          >
            {t('pages.licenseFeatureGroups.deactivateWarning', { count: subscriptionCount })}
          </p>
        </div>
      )}
    </div>
  );
}
