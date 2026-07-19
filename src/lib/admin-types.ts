export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'editor' | 'viewer';
}

export interface JwtPayload {
  email: string;
  uid: string;
}

export interface AuthService {
  verifyAdminToken(authHeader: string | null): Promise<AdminUser | null>;
}
