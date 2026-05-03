import { UserManagerSettings } from 'oidc-client-ts';
import { environment } from '../config/environment';

export const oidcConfig: UserManagerSettings = {
  authority: environment.issuer,
  client_id: environment.clientId,
  redirect_uri: window.location.origin,
  post_logout_redirect_uri: window.location.origin,
  response_type: 'code',
  scope: 'openid profile email tenant/tenant_read tenant/tenant_write user/user_read user/user_write',
  automaticSilentRenew: false,
  silent_redirect_uri: `${window.location.origin}/silent-renew.html`,
  loadUserInfo: true,
  monitorSession: false,
  filterProtocolClaims: true,
  metadataUrl: environment.wellKnownEndpointUrl,
  revokeTokensOnSignout: true,
};