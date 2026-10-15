/** Platform contact only. School-specific notices require tenant configuration. */
export function legalDetails(env: NodeJS.ProcessEnv = process.env) {
  const name = env.PLATFORM_OPERATOR_NAME?.trim() || '';
  const email = env.PRIVACY_CONTACT_EMAIL?.trim() || '';
  return {
    operatorName: name.length > 0 && name.length <= 200 && !/[\r\n\x00]/.test(name) ? name : null,
    privacyEmail: email.length <= 254 && /^[A-Za-z0-9.!$&'*+/=_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(email) ? email : null,
  };
}
