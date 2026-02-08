export interface Props {
  [key: string]: unknown;
  userId: string;
  tickTickAccessToken: string;
  tickTickRefreshToken: string | null;
  tickTickExpiresAt: string | null;
  tickTickScope: string;
}
