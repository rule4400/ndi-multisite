import keytar from 'keytar';
import bcrypt from 'bcryptjs';
import { AuthResult, UserRole } from '../../shared/types';

const SERVICE = 'ndi-multisite';
const ACCOUNT_FULL = 'full';
const ACCOUNT_VIEWONLY = 'viewonly';

export class AuthManager {
  private currentRole: UserRole | null = null;

  async login(password: string): Promise<AuthResult> {
    try {
      const fullHash = await keytar.getPassword(SERVICE, ACCOUNT_FULL);
      const viewHash = await keytar.getPassword(SERVICE, ACCOUNT_VIEWONLY);

      if (fullHash && await bcrypt.compare(password, fullHash)) {
        this.currentRole = 'full';
        return { success: true, role: 'full' };
      }

      if (viewHash && await bcrypt.compare(password, viewHash)) {
        this.currentRole = 'viewonly';
        return { success: true, role: 'viewonly' };
      }

      return { success: false, role: null, error: 'パスワードが正しくありません' };
    } catch (err) {
      return { success: false, role: null, error: String(err) };
    }
  }

  logout(): void {
    this.currentRole = null;
  }

  getRole(): UserRole | null {
    return this.currentRole;
  }

  isFullAccess(): boolean {
    return this.currentRole === 'full';
  }

  async setPassword(role: UserRole, password: string): Promise<void> {
    const hash = await bcrypt.hash(password, 10);
    await keytar.setPassword(SERVICE, role === 'full' ? ACCOUNT_FULL : ACCOUNT_VIEWONLY, hash);
  }

  async isFirstRun(): Promise<boolean> {
    const fullHash = await keytar.getPassword(SERVICE, ACCOUNT_FULL);
    const viewHash = await keytar.getPassword(SERVICE, ACCOUNT_VIEWONLY);
    return !fullHash && !viewHash;
  }
}
