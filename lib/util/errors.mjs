export class ToolError extends Error {}

export function sanitize(text) {
  let s = String(text ?? '');
  s = s.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    '[REDACTED]',
  );
  s = s.replace(
    /("?(?:private_key|access_token|refresh_token|client_secret|id_token|api_key)"?\s*[:=]\s*)"?[^"\s,}]+"?/gi,
    '$1[REDACTED]',
  );
  return s;
}

function errorHint(text, code) {
  if (code === 429 || /quota|rate limit|ratelimitexceeded|resource_exhausted|too many requests/.test(text)) {
    return 'Google Search Console API quota or rate limit reached. Wait a bit and retry, or raise the quota in Google Cloud.';
  }
  if (/has not been used in project|service_disabled|accessnotconfigured|api is disabled|it is disabled|api has not been used|is not enabled/.test(text)) {
    return "The Search Console API is not enabled for this credential's Google Cloud project. Enable it with: gcloud services enable searchconsole.googleapis.com";
  }
  if (code === 403 || /permission|forbidden|permission_denied|sufficient permission|does not have access/.test(text)) {
    return 'The service account cannot read this property. In Search Console, add its email under Settings, Users and permissions, with the Restricted (read) role.';
  }
  if (code === 401 || /invalid_grant|invalid credentials|invalid jwt|jwt signature|could not load the default credentials|unauthenticated|unauthorized/.test(text)) {
    return 'Authentication failed. Check your service-account key by running: npx @akashrajpurohit/gsc-mcp doctor';
  }
  if (code === 404 || /entity was not found/.test(text)) {
    return 'That property or URL was not found or is not accessible. Run gsc_list_sites to see the exact siteUrl values you can use.';
  }
  if (/etimedout|econnreset|enotfound|eai_again|socket hang up|network timeout|request timed out/.test(text)) {
    return 'Could not reach Google. Check your network connection and try again.';
  }
  return null;
}

export function describeError(e) {
  const message = e?.message ?? String(e);
  const code = e?.code ?? e?.status ?? e?.response?.status;
  const hint = errorHint(`${message} ${code ?? ''}`.toLowerCase(), code);
  return hint ? `${hint} (original: ${message})` : message;
}
