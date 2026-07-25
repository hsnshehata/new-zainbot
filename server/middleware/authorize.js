function requireActorRole(...allowedRoles) {
  const allowed = new Set(allowedRoles);

  return (req, res, next) => {
    const role = req.auth?.actorRole || req.user?.role;
    if (!role || !allowed.has(role)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'You do not have permission to perform this action',
      });
    }
    return next();
  };
}

function isDirectActor(req) {
  return Boolean(req.auth)
    && !req.auth.isImpersonating
    && req.auth.actorUserId === req.auth.subjectUserId;
}

function requireDirectActorRole(...allowedRoles) {
  const requireAllowedRole = requireActorRole(...allowedRoles);
  return (req, res, next) => {
    if (!isDirectActor(req)) {
      return res.status(403).json({
        success: false,
        error: 'DIRECT_ADMIN_SESSION_REQUIRED',
        message: 'End impersonation before performing this administrative action',
      });
    }
    return requireAllowedRole(req, res, next);
  };
}

module.exports = {
  requireActorRole,
  requireDirectActorRole,
  isDirectActor,
};
