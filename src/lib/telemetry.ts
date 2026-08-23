/**
 * OpenTelemetry ฝั่งเบราว์เซอร์ — ส่ง error และ trace ไป SigNoz ผ่าน gateway
 *
 * **import แบบ dynamic เท่านั้น** (ดู `src/index.tsx`) เพื่อให้ Vite แยกเป็น chunk
 * ต่างหาก — environment ที่ไม่เปิด telemetry จะไม่โหลด SDK (~135 KB) ลงเครื่อง
 * ผู้ใช้เลย
 *
 * ปลายทางคือ gateway ไม่ใช่ SigNoz ตรง ๆ เพราะ OTLP ของ SigNoz OSS ไม่มี
 * authentication เลย ใครยิงถึงยัดข้อมูลจนดิสก์เต็มได้
 *
 * โครงเดียวกับ `carmen-inventory-frontend-react/lib/telemetry.ts` แต่ **ก๊อปมา
 * ไม่ได้แชร์** — สอง repo นี้ไม่มี registry กลางร่วมกัน และการตั้ง registry เพื่อ
 * ไฟล์เดียวแพงกว่าการก๊อป สิ่งที่ต่างกันจริงคือที่มาของ base URL, token
 * และสวิตช์ (ที่นี่มาจาก env ไม่ใช่ config.json)
 */
import { context } from '@opentelemetry/api';
import { SeverityNumber, logs } from '@opentelemetry/api-logs';
import { ZoneContextManager } from '@opentelemetry/context-zone';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  WebTracerProvider,
} from '@opentelemetry/sdk-trace-web';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

const LOGGER_NAME = 'carmen.platform';
const SERVICE_NAME = 'carmen-platform';

/** เบราว์เซอร์สร้าง span เร็วกว่า backend มาก เก็บทุกอันคือถมดิสก์เปล่า ๆ */
const TRACE_SAMPLE_RATIO = 0.1;

let started = false;

export function isTelemetryEnabled(): boolean {
  return import.meta.env.REACT_APP_OTEL_ENABLED === 'true';
}

function backendBase(): string {
  return String(import.meta.env.REACT_APP_API_BASE_URL ?? '').replace(/\/+$/, '');
}

/**
 * header ของทุก request ที่ส่ง telemetry
 *
 * **ส่งเป็นฟังก์ชัน ไม่ใช่ object** — exporter อ่าน header ตอน export แต่ละครั้ง
 * ถ้าส่ง object ที่ประเมินค่าไว้แล้ว token จะถูกแช่ไว้ตั้งแต่ตอน init แล้วกลายเป็น
 * ของหมดอายุ ทำให้ telemetry เงียบไปทั้งหมดโดยขึ้นแค่ 401 ที่ไม่มีใครเห็น
 */
async function telemetryHeaders(): Promise<Record<string, string>> {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function initTelemetry(version: string): void {
  if (started) return;
  started = true;

  const backend = backendBase();
  const base = `${backend}/telemetry/v1`;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: version,
    'service.namespace': 'carmen',
    // คีย์ชื่อเดิม ไม่ใช่ deployment.environment.name ของ semconv ล่าสุด —
    // SigNoz index ตัวนี้
    'deployment.environment': 'dev',
    'browser.user_agent': navigator.userAgent,
  });

  const loggerProvider = new LoggerProvider({
    resource,
    processors: [
      // เวอร์ชัน browser flush ให้เองตอนผู้ใช้ปิดแท็บ — error วินาทีสุดท้ายไม่หาย
      new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({ url: `${base}/logs`, headers: telemetryHeaders }),
      }),
    ],
  });
  logs.setGlobalLoggerProvider(loggerProvider);

  const tracerProvider = new WebTracerProvider({
    resource,
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(TRACE_SAMPLE_RATIO),
    }),
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({ url: `${base}/traces`, headers: telemetryHeaders }),
      ),
    ],
  });
  tracerProvider.register({ contextManager: new ZoneContextManager() });

  registerInstrumentations({
    tracerProvider,
    instrumentations: [
      new DocumentLoadInstrumentation(),
      new FetchInstrumentation({
        // ถ้าไม่ตั้งค่านี้ web SDK จะไม่ใส่ traceparent ให้ request ข้าม origin
        // แล้ว trace ฝั่งเบราว์เซอร์กับฝั่ง backend จะกลายเป็นคนละเส้น
        propagateTraceHeaderCorsUrls: [new RegExp(escapeRegExp(backend))],
        ignoreUrls: [new RegExp(escapeRegExp(base))],
      }),
    ],
  });

  installErrorHandlers();
}

/**
 * error ที่เกิด **ก่อนล็อกอิน** ส่งผ่านช่อง anonymous ที่ gateway จำกัดหนัก
 *
 * ตอนนั้นไม่มี token ช่องปกติจึงตอบ 401 แล้ว error หายเงียบ — ครอบทั้งหน้า login
 * ซึ่งเป็นกลุ่มบั๊กที่กระทบหนักที่สุด ใช้ fetch ตรงไม่ผ่าน SDK เพราะหลายเคสที่พัง
 * ตั้งแต่ต้น SDK ยัง init ไม่ได้
 */
export async function reportPreLoginError(
  message: string,
  stack?: string,
): Promise<void> {
  try {
    const nowNano = `${Date.now()}000000`;
    await fetch(`${backendBase()}/telemetry/v1/anonymous/logs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        resourceLogs: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: SERVICE_NAME } },
                { key: 'service.namespace', value: { stringValue: 'carmen' } },
                { key: 'deployment.environment', value: { stringValue: 'dev' } },
              ],
            },
            scopeLogs: [
              {
                scope: { name: LOGGER_NAME },
                logRecords: [
                  {
                    timeUnixNano: nowNano,
                    severityNumber: 17,
                    severityText: 'ERROR',
                    body: { stringValue: message },
                    attributes: [
                      { key: 'carmen.source', value: { stringValue: 'pre-login' } },
                      { key: 'carmen.url', value: { stringValue: window.location.pathname } },
                      ...(stack
                        ? [{ key: 'exception.stacktrace', value: { stringValue: stack } }]
                        : []),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    });
  } catch {
    // เงียบเสมอ — ส่ง error ไม่ได้ก็ไม่ควรสร้าง error ใหม่ทับ
  }
}

export function reportError(
  message: string,
  detail?: { stack?: string; source?: string },
): void {
  // ไม่มี token = gateway ตอบ 401 แล้ว error หายเงียบ ส่งเข้าช่อง anonymous แทน
  if (!localStorage.getItem('token')) {
    void reportPreLoginError(message, detail?.stack);
    return;
  }
  try {
    logs.getLogger(LOGGER_NAME).emit({
      severityNumber: SeverityNumber.ERROR,
      severityText: 'ERROR',
      body: message,
      attributes: {
        'carmen.source': detail?.source ?? 'unknown',
        'carmen.url': window.location.pathname,
        ...(detail?.stack ? { 'exception.stacktrace': detail.stack } : {}),
      },
      context: context.active(),
    });
  } catch {
    // telemetry ต้องไม่มีวันทำให้แอปพัง
  }
}

function installErrorHandlers(): void {
  window.addEventListener('error', (e) => {
    reportError(e.message || 'window.onerror', {
      stack: e.error instanceof Error ? e.error.stack : undefined,
      source: 'window.onerror',
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    reportError(reason instanceof Error ? reason.message : String(reason), {
      stack: reason instanceof Error ? reason.stack : undefined,
      source: 'unhandledrejection',
    });
  });
}
