# AI Inbox Assistant

<div align="center">

**🇬🇧 English · 🇫🇷 Français · 🇪🇸 Español**

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Online-brightgreen)](https://ai-inbox-assistant.ccourbain.workers.dev/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)

</div>

---

## 🇬🇧 English

### Your AI chief of staff for email

AI Inbox Assistant is a private, self-hosted Gmail inbox powered by artificial intelligence. It reads, categorizes, and summarizes your emails so you only deal with what actually matters.

**Key features:**
- Smart inbox with AI categorization (Important, Transactions, Appointments, Subscriptions, Suspicious...)
- Focus mode — only shows high-priority emails
- Tone composer — AI-assisted reply drafting with tone adjustment
- Snooze — postpone emails to be reminded later
- Documents tab — automatically detects invoices, quotes, contracts
- Waiting tab — tracks emails where you're waiting for a reply
- Risks tab — flags overdue invoices and urgent matters
- Agenda — upcoming appointments extracted from email
- Privacy-first — runs on your own Cloudflare account, no third-party data storage
- Multilingual — Spanish and French

**Tech stack:**
- [TanStack Start](https://tanstack.com/start) + React + TypeScript
- [Cloudflare Workers](https://workers.cloudflare.com/) (serverless runtime)
- [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite database)
- [Cloudflare Vectorize](https://developers.cloudflare.com/vectorize/) (AI memory/embeddings)
- Gmail API + OAuth 2.0
- i18next (ES/FR)

---

## 🇫🇷 Français

### Votre chef de cabinet IA pour les emails

AI Inbox Assistant est une boîte de réception Gmail privée et auto-hébergée, propulsée par l'intelligence artificielle. Elle lit, catégorise et résume vos emails pour que vous ne traitiez que ce qui compte vraiment.

**Fonctionnalités clés :**
- Boîte intelligente avec catégorisation IA (Important, Démarches, Rendez-vous, Abonnements, Suspect...)
- Mode Focus — affiche uniquement les emails prioritaires
- Compositeur de ton — rédaction de réponses assistée par IA avec ajustement du ton
- Snooze — reporter les emails pour être rappelé plus tard
- Onglet Documents — détecte automatiquement factures, devis, contrats
- Onglet En attente — suit les emails où vous attendez une réponse
- Onglet Risques — signale les factures en retard et les urgences
- Agenda — rendez-vous à venir extraits des emails
- Privacy-first — fonctionne sur votre propre compte Cloudflare, aucun stockage tiers
- Multilingue — espagnol et français

---

## 🇪🇸 Español

### Tu jefe de gabinete de IA para el correo

AI Inbox Assistant es una bandeja de entrada de Gmail privada y auto-alojada, impulsada por inteligencia artificial. Lee, categoriza y resume tus correos para que solo te ocupes de lo que realmente importa.

**Funcionalidades clave:**
- Bandeja inteligente con categorización IA (Importante, Trámites, Citas, Suscripciones, Sospechoso...)
- Modo Foco — muestra solo los correos prioritarios
- Compositor de tono — redacción de respuestas asistida por IA con ajuste de tono
- Snooze — posponer correos para que te recuerden más tarde
- Pestaña Documentos — detecta automáticamente facturas, presupuestos, contratos
- Pestaña Esperando — rastrea correos donde esperas respuesta
- Pestaña Riesgos — señala facturas vencidas y asuntos urgentes
- Agenda — citas próximas extraídas del correo
- Privacy-first — corre en tu propia cuenta de Cloudflare, sin almacenamiento de terceros
- Multilingüe — español y francés

---

## Setup / Installation / Configuración

### Prerequisites / Prérequis / Requisitos
- [Node.js](https://nodejs.org/) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`npm install -g wrangler`)
- Cloudflare account
- Google Cloud project with Gmail API enabled

### Steps / Étapes / Pasos

```bash
# 1. Clone
git clone https://github.com/tikriss64/ai-inbox-assistant.git
cd ai-inbox-assistant

# 2. Install dependencies
npm install

# 3. Configure wrangler.jsonc with your Cloudflare account/database IDs

# 4. Set secrets
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put OPENAI_API_KEY # or your preferred AI provider

# 5. Run migrations
wrangler d1 migrations apply ai-inbox-db

# 6. Deploy
wrangler deploy
```

### Environment variables / Variables d'environnement / Variables de entorno

See `.env.example` for the full list of required configuration values.

---

## Demo

 **[https://ai-inbox-assistant.ccourbain.workers.dev/](https://ai-inbox-assistant.ccourbain.workers.dev/)**

---

## License

MIT
