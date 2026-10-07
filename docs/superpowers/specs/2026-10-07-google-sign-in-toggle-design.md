# สวิตช์เปิด/ปิดปุ่ม Google sign-in จาก platform config

## 0. ที่มา / การตัดสินใจ (กับ user 2026-10-07)

ปุ่ม "Continue with Google" บนหน้า login ของ carmen-platform (`src/pages/Login.tsx:305`) แสดงเสมอ
ไม่มีทางปิด และบน environment ที่ตั้ง Google OAuth ไม่ครบ กดแล้วจะเจอ JSON ดิบ 503 ของ gateway

**เป้าหมาย:** admin เปิด/ปิดปุ่มได้จากหน้า `/platform/configs` โดยไม่ต้อง build ใหม่

| คำถาม | คำตอบ |
|---|---|
| เก็บสวิตช์ที่ไหน | `tb_platform_config` (backend) — ไม่ใช่ build-time env, ไม่ใช่ runtime config.json |
| คุมแอปไหน | แยกสวิตช์ต่อแอป: `platform` และ `app` (ทุก client ที่ไม่ใช่ platform) |
| ไม่มีแถวใน DB | **ซ่อน** (opt-in) — default `{ platform: false, app: false }` |
| backend บังคับด้วยไหม | **ใช่** — authorize/callback ปฏิเสธเมื่อปิด ไม่ใช่แค่ซ่อนปุ่ม |
| ขอบเขต FE รอบนี้ | carmen-platform เท่านั้น — inventory FE ทำรอบถัดไป (ดู §5) |

ชื่อฟิลด์ `app` (ไม่ใช่ `inventory`) ตรงกับ target ที่ gateway ใช้อยู่แล้ว
(`auth.controller.ts` → `app === 'platform' ? 'platform' : 'app'`) — จึงครอบ mobile ด้วยถ้า mobile ใช้ Google

## 1. Backend (`carmen-turborepo-backend-v2`)

### 1.1 key ใหม่ `google_sign_in`

`apps/micro-cluster/src/cluster/platform-config/platform-config.schema.ts` — เพิ่มใน `PLATFORM_CONFIG_REGISTRY`
ตามแบบ `license` / `platform_migration`:

```ts
google_sign_in: {
  schema: z.object({ platform: z.boolean(), app: z.boolean() }),
  default: { platform: false, app: false },
},
```

GET/PUT/PATCH `api-system/platform/configs/:config_key` รองรับ key นี้เองโดยไม่ต้องแก้ controller
(สิทธิ์ `platform_config.read` / `platform_config.manage` ตามปกติ ไม่มีด่านพิเศษใน `writeKeyDenial`)

### 1.2 endpoint สาธารณะ `GET /api/auth/google/status?app=<platform|...>`

ใน `apps/backend-gateway/src/auth/auth.controller.ts` (controller ไม่มี guard ระดับ class อยู่แล้ว):

- ไม่มี `KeycloakGuard` · มี `@Throttle` แบบเดียวกับ `google/authorize`
- **ไม่ใส่ `AppIdGuard`** — ตามแบบ `google/authorize`; ไม่ต้องเติม app allowlist / generated catalog
  (ตัดกับดัก api_name ใหม่ทิ้ง) ข้อมูลที่เปิดเผยมีแค่ boolean
- target แปลงแบบเดียวกับ authorize: `app === 'platform' ? 'platform' : 'app'`
- ตอบ `{ enabled: boolean }` โดย `enabled = flag[target] === true && isGoogleSignInConfigured()`
  → env ที่ตั้ง Google OAuth ไม่ครบ ปุ่มซ่อนเองแม้ admin เปิดสวิตช์
- อ่าน flag ผ่าน helper เดียว (เช่น `isGoogleSignInEnabledFor(target)`) ที่เรียก
  `PlatformConfigsService.findOne('google_sign_in', ...)` แบบเดียวกับ `expiry_thresholds.controller.ts`
  — `findOne` คืน default เมื่อไม่มีแถว และไม่ต้องมี user_id
- อ่าน config ไม่สำเร็จ (RPC error) → ถือว่า **ปิด** (fail closed) และ log
- `AuthModule` ต้อง provide `PlatformConfigsService` (แบบ `expiry_thresholds.module.ts`)
- Swagger: `security: [{}]` เหมือน endpoint Google อื่น

### 1.3 บังคับใน flow

- `google/authorize`: หลังเช็ค `isGoogleSignInConfigured()` (503 เดิมคงไว้) ถ้า flag ของ target ปิด →
  `302 ${frontendUrl}/login?error=google_disabled` (`frontendUrl` เลือกตาม target แบบเดียวกับ callback)
  ไม่ตั้ง cookie ของ flow
- `google/callback`: หลังแยก target จาก `state` ถ้า flag ปิด → `fail('google_disabled')` ก่อนแลก `code`
  (กันกรณีปิดสวิตช์ระหว่างมีคน sign-in ค้างอยู่)

## 2. carmen-platform

### 2.1 `src/pages/Login.tsx`

- ตอน mount เรียก `GET ${apiBaseUrl}/api/auth/google/status?app=platform`
- แสดงเส้นแบ่ง "or" + ปุ่ม Google **เฉพาะเมื่อได้ `enabled === true`** — ระหว่างโหลด / error / 404 = ซ่อน
- `googleErrorKey`: เพิ่ม `case 'google_disabled'` → `login.googleDisabled`
- `src/i18n/{en,th}.ts`: เพิ่ม `login.googleDisabled`
  (en: "Google sign-in is turned off. Please sign in with your email and password."
  th: "ปิดการเข้าสู่ระบบด้วย Google อยู่ กรุณาเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน")

### 2.2 การ์ดใหม่ `src/pages/platformConfig/GoogleSignInConfigCard.tsx`

- ลอกแบบ `LicenseEnforcementCard` (โครง `ConfigCardShell`, edit/cancel/save, footer audit)
- 2 สวิตช์: Platform / App (ข้อความอธิบายว่า App = inventory และ client อื่นที่ไม่ใช่ platform)
- บันทึกด้วย `platformConfigService.patch('google_sign_in', { platform, app })`
- แปลงค่าดิบด้วย `=== true` (ตรงกับฝั่ง backend)
- `canManage` = `platform_config.manage` อย่างเดียว
- ต่อเข้า `PlatformConfigManagement.tsx` (เพิ่ม `CardId`) + i18n ของการ์ด
- `src/types/index.ts`: `GoogleSignInConfig { platform: boolean; app: boolean }`

## 3. ลำดับ deploy และผลข้างเคียง

1. **BE ก่อน FE** — FE ขึ้นก่อน: status ตอบ 404 → ปุ่มซ่อน (ปลอดภัยแต่เงียบ)
2. ทันทีที่ BE ขึ้น: ไม่มีแถว = ปิดทั้งสองแอป → **ปุ่ม Google ใช้ไม่ได้ทุกที่จนกว่า admin จะเปิด**
   - platform FE ตัวเก่า (ก่อน deploy FE) ยังแสดงปุ่ม แต่กดแล้วเด้งกลับ `?error=google_disabled`
     ซึ่ง FE เก่าแสดงเป็นข้อความ generic "Google sign-in failed"
   - inventory FE แสดงปุ่มต่อ แต่กดแล้วเด้งกลับพร้อม error เดียวกันจนกว่าจะเปิด `app`
3. หลัง deploy dev: เปิดสวิตช์ที่ `/platform/configs` ตามที่ต้องการทันที

## 4. ตรวจสอบ

- Static: typecheck + lint ทั้งสองรีโป · เทสต์ที่มีอยู่ต้องผ่าน — `Login.test.tsx` (describe
  "Login — Google sign-in") ต้องปรับให้ mock status `enabled: true` ก่อนหาปุ่ม
- ไม่เขียนเทสต์ใหม่ (ตามความต้องการของ user) เว้นแต่จะขอ
- มือ (curl):
  - `GET /api/auth/google/status?app=platform` → `{enabled:false}` ก่อนตั้ง, `true` หลัง PATCH
  - `GET /api/auth/google/authorize?app=platform` ตอนปิด → 302 ไป `/login?error=google_disabled`
- มือ (เบราว์เซอร์): หน้า login ไม่มีปุ่มตอนปิด / มีปุ่มตอนเปิด · การ์ดใน `/platform/configs` บันทึกได้

## 5. นอกขอบเขต (รอบถัดไป)

- inventory FE (`routes/login/login-form.tsx:239` → `GoogleSignInButton`) เรียก status ด้วย `app=app`
  แล้วซ่อนปุ่มแบบเดียวกัน + map `google_disabled`
- cache ค่า flag ใน gateway — ไม่ทำ (หน้า login เรียกครั้งเดียวต่อการโหลด, throttle คุมอยู่)
