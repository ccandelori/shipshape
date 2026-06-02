import { Router } from 'express';
import { oauthService } from './service.js';
import { registry, z } from '../../openapi/registry.js';

// Basic OAuth issuance routes for public flows.
// Mounted under /api/v1/oauth or separate; for skeleton under v1 for simplicity.
// In full, separate /oauth namespace.

export const oauthRouter = Router();

// Device code
registry.registerPath({
  method: 'post',
  path: '/api/v1/oauth/device/code',
  description: 'Start Device Authorization Grant',
  // requestBody schema omitted for skeleton type compatibility with current zod-to-openapi registration.
  responses: { 200: { description: 'Device code issued' } },
});

oauthRouter.post('/device/code', async (req, res) => {
  const { client_id } = req.body;
  const app = await oauthService.getAppByClientId(client_id);
  if (!app || !app.allowed_grant_types.includes('device_code')) {
    return res.status(400).json({ error: 'invalid_client' });
  }
  const { device_code, user_code, verification_uri } = await oauthService.deviceCode(app.id, app.default_scopes);
  return res.json({ device_code, user_code, verification_uri });
});

// Poll for device token
oauthRouter.post('/device/token', async (req, res) => {
  const { device_code } = req.body;
  const result = await oauthService.pollDeviceToken(device_code);
  if (result.error) return res.status(400).json(result);
  return res.json(result);
});

// Token exchange (PKCE / CC stub)
oauthRouter.post('/token', async (req, res) => {
  const { grant_type, code, code_verifier, client_id, client_secret, device_code } = req.body;

  if (grant_type === 'authorization_code') {
    const result = await oauthService.exchangeAuthCode(code, code_verifier, req.body.redirect_uri || '');
    if ('error' in result) return res.status(400).json(result);
    return res.json(result);
  }

  if (grant_type === 'urn:ietf:params:oauth:grant-type:device_code') {
    const result = await oauthService.pollDeviceToken(device_code);
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  }

  if (grant_type === 'client_credentials') {
    const app = await oauthService.getAppByClientId(client_id);
    if (!app || !app.is_system) return res.status(400).json({ error: 'invalid_client' });
    if (client_secret && !oauthService.validateClientSecret(app, client_secret)) {
      return res.status(401).json({ error: 'invalid_client' });
    }
    const result = await oauthService.clientCredentials(app.id, app.default_scopes);
    return res.json(result);
  }

  return res.status(400).json({ error: 'unsupported_grant_type' });
});

export default oauthRouter;
