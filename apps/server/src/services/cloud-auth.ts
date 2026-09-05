// Cloud auth pro DrawThings API – port proxy/src/cloud-auth.ts 1:1.
// Krátkodobé tokeny s auto-refresh (5min práh). Bez externích závislostí,
// fetch je v Bun nativní.

const DRAWTHINGS_API_BASE = "https://api.drawthings.ai";
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

interface TokenResponse {
  shortTermToken: string;
  expiresIn: number;
}

export interface CloudAuthStatus {
  configured: boolean;
  expiresAt: string | null;
  expiresIn: number | null;
}

class CloudAuthManager {
  private apiKey: string | null = null;
  private shortTermToken: string | null = null;
  private expiresAt: number | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingRefresh: Promise<void> | null = null;

  async configure(apiKey: string): Promise<void> {
    this.logout();
    this.apiKey = apiKey;
    await this.refreshToken();
  }

  async getToken(): Promise<string> {
    if (!this.apiKey) throw new Error("Cloud auth not configured");
    if (this.needsRefresh()) {
      await this.refreshToken();
    }
    if (!this.shortTermToken) throw new Error("No token available");
    return this.shortTermToken;
  }

  getStatus(): CloudAuthStatus {
    return {
      configured: this.apiKey !== null,
      expiresAt: this.expiresAt ? new Date(this.expiresAt).toISOString() : null,
      expiresIn: this.expiresAt ? Math.max(0, Math.floor((this.expiresAt - Date.now()) / 1000)) : null,
    };
  }

  logout(): void {
    this.apiKey = null;
    this.shortTermToken = null;
    this.expiresAt = null;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    this.pendingRefresh = null;
  }

  isConfigured(): boolean {
    return this.apiKey !== null;
  }

  private needsRefresh(): boolean {
    if (!this.shortTermToken || !this.expiresAt) return true;
    return Date.now() + TOKEN_REFRESH_THRESHOLD_MS >= this.expiresAt;
  }

  async refreshToken(): Promise<void> {
    if (this.pendingRefresh) return this.pendingRefresh;
    this.pendingRefresh = this._refreshToken();
    try {
      await this.pendingRefresh;
    } finally {
      this.pendingRefresh = null;
    }
  }

  private async _refreshToken(): Promise<void> {
    if (!this.apiKey) throw new Error("No API key configured");
    const res = await fetch(`${DRAWTHINGS_API_BASE}/sdk/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apiKey: this.apiKey,
        appCheckType: "none",
        appCheckToken: null,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Token request failed (HTTP ${res.status}): ${text}`);
    }
    const data = (await res.json()) as TokenResponse;
    this.shortTermToken = data.shortTermToken;
    this.expiresAt = Date.now() + data.expiresIn * 1000;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const refreshIn = Math.max(0, data.expiresIn * 1000 - TOKEN_REFRESH_THRESHOLD_MS);
    this.refreshTimer = setTimeout(() => void this.refreshToken(), refreshIn);
    if (typeof this.refreshTimer === "object" && this.refreshTimer !== null) {
      (this.refreshTimer as unknown as { unref?: () => void }).unref?.();
    }
  }
}

export const cloudAuth = new CloudAuthManager();
