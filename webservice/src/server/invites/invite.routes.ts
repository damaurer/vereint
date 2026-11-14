import { Router } from 'express';
import { validateInvite } from './invite.service';

export const inviteRoutes = Router();
inviteRoutes.get('/:code', async (req, res, next) => {
  try {
    const invite = await validateInvite(req.params['code']);
    if (!invite) { res.status(404).json({ error: 'invite-not-found' }); return; }
    res.json(invite);
  } catch (error) { next(error); }
});
