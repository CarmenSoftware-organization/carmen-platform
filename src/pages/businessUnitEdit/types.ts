import type React from 'react';
import type { BusinessUnitConfig } from '../../types';

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
  hotel_address: string;
  hotel_zip_code: string;
  // Company Information
  company_name: string;
  company_tel: string;
  company_email: string;
  company_address: string;
  company_zip_code: string;
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
  db_connection: string;
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
  hotel_address: '',
  hotel_zip_code: '',
  company_name: '',
  company_tel: '',
  company_email: '',
  company_address: '',
  company_zip_code: '',
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
  db_connection: '',
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
