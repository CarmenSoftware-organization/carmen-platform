export interface PaginateParams {
  page?: number;
  perpage?: number;
  search?: string;
  searchfields?: string[];
  filter?: Record<string, unknown> | unknown[];
  sort?: string;
  advance?: string;
}

export interface PaginateInfo {
  total: number;
  page: number;
  perpage: number;
  totalPages?: number;
}

export interface ApiListResponse<T> {
  data: T[];
  paginate?: PaginateInfo;
  total?: number;
}

export interface Cluster {
  id: string;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
  bu_count?: number;
  users_count?: number;
  created_at?: string;
  created_by_name?: string;
  updated_at?: string;
  updated_by_name?: string;
}

export interface BusinessUnitConfig {
  id?: string;
  key: string;
  label: string;
  datatype?: string;
  value?: unknown;
}

export interface BusinessUnit {
  id: string;
  cluster_id?: string;
  code: string;
  name: string;
  alias_name?: string;
  description?: string;
  is_hq?: boolean;
  is_active: boolean;
  // Hotel Information
  hotel_name?: string;
  hotel_tel?: string;
  hotel_email?: string;
  hotel_address?: string;
  hotel_zip_code?: string;
  // Company Information
  company_name?: string;
  company_tel?: string;
  company_email?: string;
  company_address?: string;
  company_zip_code?: string;
  // Tax Information
  tax_no?: string;
  branch_no?: string;
  // Date/Time Formats
  date_format?: string;
  date_time_format?: string;
  time_format?: string;
  long_time_format?: string;
  short_time_format?: string;
  timezone?: string;
  // Number Formats
  perpage_format?: string;
  amount_format?: string;
  quantity_format?: string;
  recipe_format?: string;
  // Calculation Settings
  calculation_method?: string;
  default_currency_id?: string;
  // Config & Connection
  db_connection?: unknown;
  config?: BusinessUnitConfig[] | null;
  cluster_name?: string;
  created_at?: string;
  created_by_name?: string;
  updated_at?: string;
  updated_by_name?: string;
}

export interface UserInfo {
  firstname?: string;
  middlename?: string;
  lastname?: string;
  telephone?: string;
}

export interface User {
  id: string;
  name?: string;
  email: string;
  role?: string;
  status?: string;
  platform_role?: string;
  alias_name?: string;
  firstname?: string;
  middlename?: string;
  lastname?: string;
  telephone?: string;
  user_info?: UserInfo;
  business_unit?: BusinessUnit[];
  created_at?: string;
  updated_at?: string;
}

export interface LoginResponse {
  access_token?: string;
  token?: string;
  user?: User;
  data?: User;
  name?: string;
  platform_role?: string;
}

export interface LoginResult {
  success: boolean;
  error?: string;
}

export interface AuthContextValue {
  user: User | null;
  login: (credentials: LoginCredentials) => Promise<LoginResult>;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
  loginResponse: LoginResponse | null;
  platformRole: string | null;
  hasRole: (roles: string[]) => boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}
