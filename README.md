# WhatsApp Message Scheduler - Backend

A Node.js backend server that enables scheduling WhatsApp messages, similar to scheduling emails. Built with Express.js and whatsapp-web.js.

## Features

- 📱 **WhatsApp Web Integration** - Connect via QR code scanning
- ⏰ **Message Scheduling** - Schedule messages for any future date/time
- 🔄 **Recurring Messages** - Daily, weekly, or monthly repeats
- 🌐 **REST API** - Easy integration with any frontend
- 🔒 **Session Persistence** - Stay logged in across restarts

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/status` | Get connection status |
| GET | `/api/qr` | Get QR code for WhatsApp auth |
| POST | `/api/schedule` | Schedule a new message |
| GET | `/api/messages` | List all scheduled messages |
| GET | `/api/messages/:id` | Get specific message |
| PUT | `/api/messages/:id` | Update a scheduled message |
| DELETE | `/api/messages/:id` | Cancel a scheduled message |
| POST | `/api/send` | Send message immediately |
| POST | `/api/disconnect` | Logout from WhatsApp |

## Local Development

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Setup

```bash
# Clone or download this folder
cd whatsapp-scheduler-backend

# Install dependencies
npm install

# Start the server
npm start

# Or with auto-reload for development
npm run dev
```

The server will start on `http://localhost:3000`

---

## Deploy to Railway

Railway is recommended for its simplicity and generous free tier.

### Step 1: Create Railway Account
1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub

### Step 2: Deploy from GitHub

**Option A: Deploy via GitHub (Recommended)**

1. Push this backend code to a GitHub repository
2. In Railway dashboard, click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your repository
5. Railway will auto-detect the Dockerfile and deploy

**Option B: Deploy via CLI**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize new project
railway init

# Deploy
railway up
```

### Step 3: Configure Domain

1. Go to your project in Railway dashboard
2. Click on your service
3. Go to **Settings** → **Networking**
4. Click **"Generate Domain"**
5. Copy your URL (e.g., `https://your-app.railway.app`)

### Step 4: Add Persistent Storage (Important!)

WhatsApp sessions need persistent storage:

1. In Railway dashboard, click **"+ New"** → **"Database"** → **"Add Volume"**
2. Mount path: `/app/.wwebjs_auth`
3. This keeps you logged in across deployments

### Railway Environment Variables (Optional)

```
PORT=3000
NODE_ENV=production
```

---

## Deploy to Render

Render offers a free tier with some limitations.

### Step 1: Create Render Account
1. Go to [render.com](https://render.com)
2. Sign up with GitHub

### Step 2: Deploy

**Option A: Blueprint Deploy (Recommended)**

1. Push this code to GitHub
2. In Render dashboard, click **"New"** → **"Blueprint"**
3. Connect your repository
4. Render will use `render.yaml` to configure everything

**Option B: Manual Deploy**

1. Click **"New"** → **"Web Service"**
2. Connect your GitHub repository
3. Configure:
   - **Environment**: Docker
   - **Dockerfile Path**: `./Dockerfile`
   - **Plan**: Starter ($7/mo) or Free (with limitations)

### Step 3: Add Persistent Disk (Important!)

⚠️ **Note**: Render's free tier doesn't include persistent disks. The paid "Starter" plan ($7/mo) is required for session persistence.

1. Go to your service → **"Disks"**
2. Add a disk:
   - **Name**: `whatsapp-session`
   - **Mount Path**: `/app/.wwebjs_auth`
   - **Size**: 1 GB

### Render Environment Variables

Set these in the Render dashboard:
```
PORT=3000
NODE_ENV=production
```

---

## Frontend Integration

Once deployed, update your frontend with the backend URL:

1. Open your WhatsApp Scheduler page
2. Enter your backend URL (e.g., `https://your-app.railway.app`)
3. Click **Connect**
4. Scan the QR code with WhatsApp
5. Start scheduling messages!

### CORS Configuration

The backend is pre-configured to allow requests from:
- `https://navajitd.github.io`
- `http://localhost:3000`
- `http://localhost:5500`

To add more origins, edit `server.js`:

```javascript
app.use(cors({
    origin: [
        'https://navajitd.github.io',
        'https://your-domain.com',  // Add your domain
        // ...
    ]
}));
```

---

## API Usage Examples

### Schedule a Message

```bash
curl -X POST https://your-app.railway.app/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "recipient": "+919876543210",
    "message": "Hello! This is a scheduled message.",
    "scheduledTime": "2025-12-25T09:00:00.000Z",
    "repeat": "none"
  }'
```

### Get Scheduled Messages

```bash
curl https://your-app.railway.app/api/messages
```

### Cancel a Message

```bash
curl -X DELETE https://your-app.railway.app/api/messages/MESSAGE_ID
```

---

## Troubleshooting

### QR Code Not Showing
- Wait 10-15 seconds after first deployment
- Check server logs for errors
- Ensure Puppeteer dependencies are installed (Dockerfile handles this)

### Session Not Persisting
- Ensure you've added persistent storage/disk
- Railway: Add a Volume mounted to `/app/.wwebjs_auth`
- Render: Add a Disk (requires paid plan)

### Messages Not Sending
- Verify WhatsApp is connected (check `/api/status`)
- Check recipient number format (include country code: `+91...`)
- Check server logs for detailed errors

### CORS Errors
- Add your frontend domain to the CORS origin list in `server.js`
- Redeploy after changes

### "Session Closed" Errors
- This can happen after prolonged inactivity
- The server will auto-reconnect
- If persistent, delete the `.wwebjs_auth` folder and re-scan QR

---

## Important Notes

⚠️ **Disclaimer**: This uses an unofficial WhatsApp library. Use responsibly:
- Don't spam or send bulk messages
- WhatsApp may ban accounts that violate their ToS
- This is for personal use only

📱 **Keep Session Active**: 
- Railway's free tier sleeps after 30 minutes of inactivity
- Consider upgrading to keep the service always running
- Or use a service like UptimeRobot to ping the server

🔒 **Security**:
- Don't share your backend URL publicly
- Consider adding API key authentication for production use
- The session data contains your WhatsApp credentials

---

## License

MIT License - Use freely for personal projects.

---

## Support

Having issues? 
1. Check the troubleshooting section above
2. Review server logs in Railway/Render dashboard
3. Open an issue on the repository
