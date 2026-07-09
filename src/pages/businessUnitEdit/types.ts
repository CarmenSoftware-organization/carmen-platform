import type React from 'react';
import type { BusinessUnitConfig } from '../../types';
import type { DbConnectionField } from '../../utils/dbConnection';

export const BU_ROLES = ['admin', 'user'] as const;

export interface ClusterUser {
  user_id: string;
  username: string | null;
  email: string | null;
  role: string | null;
  userInfo?: {
    firstname?: string | null;
    lastname?: string | null;
    middlename?: string | null;
  } | null;
}

export interface BUUser {
  id: string;
  user_id: string;
  role: string;
  is_default: boolean;
  is_active: boolean;
  username: string | null;
  email: string | null;
  user_is_active: boolean | null;
  firstname: string | null;
  middlename: string | null;
  lastname: string | null;
}

export interface DefaultCurrency {
  id: string;
  code: string;
  name: string;
  symbol: string;
  description?: string;
  decimal_places?: number;
  is_active?: boolean;
}

export interface BusinessUnitFormData {
  cluster_id: string;
  code: string;
  name: string;
  alias_name: string;
  description: string;
  is_hq: boolean;
  is_active: boolean;
  max_license_users: string;
  // Hotel Information
  hotel_name: string;
  hotel_tel: string;
  hotel_email: string;
  hotel_address_line1: string;
  hotel_address_line2: string;
  hotel_sub_district: string;
  hotel_district: string;
  hotel_city: string;
  hotel_province: string;
  hotel_postal_code: string;
  hotel_country: string;
  hotel_latitude: string;
  hotel_longitude: string;
  // Company Information
  company_name: string;
  company_tel: string;
  company_email: string;
  company_address_line1: string;
  company_address_line2: string;
  company_sub_district: string;
  company_district: string;
  company_city: string;
  company_province: string;
  company_postal_code: string;
  company_country: string;
  company_latitude: string;
  company_longitude: string;
  // Tax Information
  tax_no: string;
  branch_no: string;
  // Date/Time Formats
  date_format: string;
  date_time_format: string;
  time_format: string;
  long_time_format: string;
  short_time_format: string;
  timezone: string;
  // Number Formats
  perpage_format: string;
  amount_format: string;
  quantity_format: string;
  recipe_format: string;
  // Calculation Settings
  calculation_method: string;
  default_currency_id: string;
  // Config & Connection
  db_connection: DbConnectionField[];
  config: BusinessUnitConfig[];
}

export const initialFormData: BusinessUnitFormData = {
  cluster_id: '',
  code: '',
  name: '',
  alias_name: '',
  description: '',
  is_hq: false,
  is_active: true,
  max_license_users: '',
  hotel_name: '',
  hotel_tel: '',
  hotel_email: '',
  hotel_address_line1: '',
  hotel_address_line2: '',
  hotel_sub_district: '',
  hotel_district: '',
  hotel_city: '',
  hotel_province: '',
  hotel_postal_code: '',
  hotel_country: '',
  hotel_latitude: '',
  hotel_longitude: '',
  company_name: '',
  company_tel: '',
  company_email: '',
  company_address_line1: '',
  company_address_line2: '',
  company_sub_district: '',
  company_district: '',
  company_city: '',
  company_province: '',
  company_postal_code: '',
  company_country: '',
  company_latitude: '',
  company_longitude: '',
  tax_no: '',
  branch_no: '',
  date_format: '',
  date_time_format: '',
  time_format: '',
  long_time_format: '',
  short_time_format: '',
  timezone: '',
  perpage_format: '{"default":10}',
  amount_format: '{"locales":"th-TH","minimumIntegerDigits":2}',
  quantity_format: '{"locales":"th-TH","minimumIntegerDigits":2}',
  recipe_format: '{"locales":"th-TH","minimumIntegerDigits":2}',
  calculation_method: '',
  default_currency_id: '',
  db_connection: [],
  config: [],
};

export interface SectionFieldProps {
  formData: BusinessUnitFormData;
  editing: boolean;
  fieldErrors: Record<string, string>;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
}
