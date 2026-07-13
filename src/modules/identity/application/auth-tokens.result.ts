/** Shape both use-cases return; the controller maps this 1:1 onto the `AuthTokens` schema. */
export interface AuthTokensResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
}
