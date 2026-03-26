# STACKPLUS - Deploy Configuration

## URLs Atuais
- Frontend: https://stackplus-web.vercel.app ✅ DEPLOYED
- API: Pendente (Railway)

## Railway Configuration
- Project: stackplus-api
- Root Directory: stackplus-api
- Environment Variables:
  - DATABASE_URL=postgresql://... (auto-generated)
  - JWT_SECRET=stackplus-jwt-secret-production-2026-change-this-key
  - JWT_EXPIRES_IN=7d
  - PORT=3001
  - FRONTEND_URL=https://stackplus-web.vercel.app
  - NODE_ENV=production

## Vercel Configuration
- Project: stackplus-web
- Root Directory: stackplus-web
- Environment Variables:
  - NEXT_PUBLIC_API_URL=https://stackplus-api.up.railway.app

## Post-Deploy Steps
1. Run: npx prisma migrate deploy
2. Run: npx prisma generate
3. Test login and basic functionality