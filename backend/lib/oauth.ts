/* Sign-in providers. Both speak OpenID Connect: send the person away, get a code back,
   swap the code for a token, then ask who they are. */
export type Provider = {
  key: "google" | "linkedin";
  label: string;
  authUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  scope: string;
  clientId?: string;
  clientSecret?: string;
};

export const PROVIDERS: Record<string, Provider> = {
  google: {
    key: "google", label: "Google",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userinfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid profile email",
    clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  linkedin: {
    key: "linkedin", label: "LinkedIn",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    userinfoUrl: "https://api.linkedin.com/v2/userinfo",
    scope: "openid profile email",
    clientId: process.env.LINKEDIN_CLIENT_ID, clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
  },
};

export const ready = (p: Provider) => !!(p.clientId && p.clientSecret);
export const readyProviders = () => Object.values(PROVIDERS).filter(ready);
export const callbackUrl = (base: string, p: Provider) => `${base}/api/auth/${p.key}/callback`;
