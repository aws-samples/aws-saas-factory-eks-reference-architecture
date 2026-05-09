// Environment configuration for React app
// Note: This file is overwritten by CDK during build
export const environment = {
  production: false,
  apiUrl: '',
  controlPlaneUrl: '',
  domain: '',
  usingCustomDomain: false,
  /**
   * Active microservice names sourced from `services-template.json` at CDK
   * synth time. Each service is assumed to expose an SSO entry endpoint at
   * `{apiUrl}/<name>/sso-entry?_jwt=<idToken>`. Populated by
   * `lib/static-sites-stack.ts` buildspec.
   */
  services: [] as string[],
};

export default environment;
