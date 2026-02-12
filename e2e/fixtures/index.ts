import { faker } from '@faker-js/faker';

/** Generate unique cluster test data */
export const generateClusterData = () => ({
  code: `CLT${Date.now().toString().slice(-6)}`,
  name: `${faker.company.name()} Cluster`,
  description: faker.company.catchPhrase(),
  is_active: true,
});

/** Generate unique business unit test data */
export const generateBusinessUnitData = () => {
  const suffix = Date.now().toString().slice(-6);
  return {
    // Basic Information
    code: `BU${suffix}`,
    name: `${faker.company.name()} Hotel`,
    alias_name: faker.string.alpha({ length: 3, casing: 'upper' }),
    description: faker.commerce.productDescription(),
    is_hq: false,
    is_active: true,

    // Hotel Information
    hotel_name: `${faker.company.name()} Hotel & Resort`,
    hotel_tel: `+66-${faker.string.numeric(2)}-${faker.string.numeric(3)}-${faker.string.numeric(4)}`,
    hotel_email: faker.internet.email(),
    hotel_address: faker.location.streetAddress({ useFullAddress: true }),
    hotel_zip_code: faker.location.zipCode('#####'),

    // Company Information
    company_name: `${faker.company.name()} Co., Ltd.`,
    company_tel: `+66-${faker.string.numeric(2)}-${faker.string.numeric(3)}-${faker.string.numeric(4)}`,
    company_email: faker.internet.email(),
    company_address: faker.location.streetAddress({ useFullAddress: true }),
    company_zip_code: faker.location.zipCode('#####'),

    // Tax Information
    tax_no: faker.string.numeric(13),
    branch_no: faker.string.numeric(5),

    // Date/Time Formats
    date_format: 'DD/MM/YYYY',
    date_time_format: 'DD/MM/YYYY HH:mm:ss',
    time_format: 'HH:mm:ss',
    long_time_format: 'HH:mm:ss.SSS',
    short_time_format: 'HH:mm',
    timezone: 'Asia/Bangkok',

    // Number Formats
    perpage_format: '{"default":10}',
    amount_format: '{"locales":"th-TH","minimumIntegerDigits":2}',
    quantity_format: '{"locales":"th-TH","minimumIntegerDigits":2}',
    recipe_format: '{"locales":"th-TH","minimumIntegerDigits":2}',

    // Calculation Settings
    calculation_method: 'fifo' as const,
    default_currency_id: '',

    // Configuration entries
    config: [
      { key: `cfg_${suffix}_1`, label: 'Check-in Time', datatype: 'string', value: '14:00' },
      { key: `cfg_${suffix}_2`, label: 'Check-out Time', datatype: 'string', value: '12:00' },
    ],

    // Database Connection
    db_connection: JSON.stringify({
      host: `db-${suffix}.test.internal`,
      port: 5432,
      database: `test_db_${suffix}`,
      schema: 'public',
    }),
  };
};

/** Generate unique user test data */
export const generateUserData = () => {
  const suffix = Date.now().toString().slice(-6);
  return {
    username: `user${suffix}@example.com`,
    email: `test${suffix}@example.com`,
    firstname: faker.person.firstName(),
    middlename: '',
    lastname: faker.person.lastName(),
    is_active: true,
  };
};

/** Generate profile update data */
export const generateProfileData = () => ({
  alias_name: faker.person.middleName(),
  firstname: faker.person.firstName(),
  middlename: '',
  lastname: faker.person.lastName(),
  telephone: `+66-${faker.string.numeric(2)}-${faker.string.numeric(3)}-${faker.string.numeric(4)}`,
});
