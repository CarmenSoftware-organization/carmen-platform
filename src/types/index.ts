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

export interface BusinessUnit {
  id: string;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
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
  user_info?: UserInfo;
  created_at?: string;
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
