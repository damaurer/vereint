import type { RequestHandler } from 'express';
import { migrateLegacyStammtischCookie } from '../stammtisch/stammtisch-cookie';
import { verifyRequestSession } from './session.service';

/**
 * `res` wird mitgegeben, damit ein fälliger Token-Refresh das rotierte
 * Refresh-Token sofort im Session-Cookie persistieren kann.
 */
export const attachIdentity: RequestHandler = (req, res, next) => {
  migrateLegacyStammtischCookie(req, res);
  void verifyRequestSession(req, res)
    .then((identity) => {
      req.identity = identity;
      next();
    })
    .catch(next);
};
