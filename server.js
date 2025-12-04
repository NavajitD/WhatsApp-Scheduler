/**
 * WhatsApp Message Scheduler Backend
 * 
 * This server handles:
 * - WhatsApp Web connection via whatsapp-web.js
 * - QR code generation for authentication
 * - Message scheduling with node-cron
 * - REST API for frontend communication
 */

const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: [
        'https://navajitd.github.io',
        'http://localhost:3000',
        'http://localhost:5500',
        'http://127.0.0.1:5500'
    ],
    credentials: true
}));
app.use(express.json());

// Data storage (in-memory for simplicity, use a database for production)
let scheduledMessages = [];
let currentQR = null;
let isConnected = false;
let connectedPhone = null;

// Ensure .wwebjs_auth directory exists
const authPath = path.join(__dirname, '.wwebjs_auth');
if (!fs.existsSync(authPath)) {
    fs.mkdirSync(authPath, { recursive: true });
}

// Initialize WhatsApp client
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: authPath
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

// WhatsApp Event Handlers
client.on('qr', async (qr) => {
    console.log('📱 QR Code received. Scan with WhatsApp to login.');
    try {
        currentQR = await qrcode.toDataURL(qr);
        isConnected = false;
    } catch (err) {
        console.error('QR generation error:', err);
    }
});

client.on('ready', async () => {
    console.log('✅ WhatsApp client is ready!');
    isConnected = true;
    currentQR = null;
    
    try {
        const info = client.info;
        connectedPhone = info.wid.user;
        console.log(`📞 Connected as: ${connectedPhone}`);
    } catch (err) {
        console.log('Could not get phone info');
    }
});

client.on('authenticated', () => {
    console.log('🔐 WhatsApp authenticated successfully');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
    isConnected = false;
});

client.on('disconnected', (reason) => {
    console.log('📵 WhatsApp disconnected:', reason);
    isConnected = false;
    connectedPhone = null;
    currentQR = null;
    
    // Try to reconnect
    setTimeout(() => {
        console.log('🔄 Attempting to reconnect...');
        client.destroy().then(() => {
            client.initialize();
        }).catch(() => {
            client.initialize();
        });
    }, 5000);
});

// Handle session errors
client.on('change_state', (state) => {
    console.log('📊 WhatsApp state changed:', state);
});

// Prevent session from going stale - ping every 5 minutes
setInterval(async () => {
    if (isConnected) {
        try {
            await client.getState();
            console.log('💓 Session heartbeat OK');
        } catch (err) {
            console.log('💔 Session heartbeat failed, reconnecting...');
            isConnected = false;
            client.destroy().then(() => {
                client.initialize();
            }).catch(() => {
                client.initialize();
            });
        }
    }
}, 5 * 60 * 1000);

// Initialize WhatsApp client
console.log('🚀 Initializing WhatsApp client...');
client.initialize().catch(err => {
    console.error('Client initialization error:', err);
});

// ===================
// API ROUTES
// ===================

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        service: 'WhatsApp Scheduler Backend',
        version: '1.0.0'
    });
});

// Get connection status
app.get('/api/status', (req, res) => {
    res.json({
        connected: isConnected,
        phone: connectedPhone,
        qr: currentQR,
        pendingMessages: scheduledMessages.filter(m => m.status === 'pending').length
    });
});

// Get QR code for WhatsApp authentication
app.get('/api/qr', (req, res) => {
    if (isConnected) {
        return res.json({
            connected: true,
            phone: connectedPhone,
            message: 'Already connected to WhatsApp'
        });
    }
    
    if (currentQR) {
        return res.json({
            qr: currentQR,
            connected: false
        });
    }
    
    res.json({
        qr: null,
        connected: false,
        message: 'QR code not yet generated. Please wait...'
    });
});

// Schedule a new message
app.post('/api/schedule', (req, res) => {
    const { recipient, message, scheduledTime, repeat } = req.body;
    
    // Validation
    if (!recipient || !message || !scheduledTime) {
        return res.status(400).json({
            success: false,
            error: 'Missing required fields: recipient, message, scheduledTime'
        });
    }
    
    // Validate phone number format
    const cleanPhone = recipient.replace(/[^0-9+]/g, '');
    if (cleanPhone.length < 10) {
        return res.status(400).json({
            success: false,
            error: 'Invalid phone number format'
        });
    }
    
    // Validate scheduled time is in the future
    const scheduleDate = new Date(scheduledTime);
    if (scheduleDate <= new Date()) {
        return res.status(400).json({
            success: false,
            error: 'Scheduled time must be in the future'
        });
    }
    
    // Create scheduled message
    const newMessage = {
        id: uuidv4(),
        recipient: cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`,
        message,
        scheduledTime: scheduleDate.toISOString(),
        repeat: repeat || 'none',
        status: 'pending',
        createdAt: new Date().toISOString()
    };
    
    scheduledMessages.push(newMessage);
    
    console.log(`📅 Message scheduled for ${newMessage.recipient} at ${scheduleDate.toLocaleString()}`);
    
    res.json({
        success: true,
        message: newMessage
    });
});

// Get all scheduled messages
app.get('/api/messages', (req, res) => {
    // Sort by scheduled time, newest first for pending, then sent
    const sorted = [...scheduledMessages].sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return new Date(b.scheduledTime) - new Date(a.scheduledTime);
    });
    
    res.json({
        messages: sorted.slice(0, 50) // Limit to 50 most recent
    });
});

// Get a specific message
app.get('/api/messages/:id', (req, res) => {
    const message = scheduledMessages.find(m => m.id === req.params.id);
    
    if (!message) {
        return res.status(404).json({
            success: false,
            error: 'Message not found'
        });
    }
    
    res.json({ message });
});

// Update a scheduled message
app.put('/api/messages/:id', (req, res) => {
    const index = scheduledMessages.findIndex(m => m.id === req.params.id);
    
    if (index === -1) {
        return res.status(404).json({
            success: false,
            error: 'Message not found'
        });
    }
    
    const existing = scheduledMessages[index];
    
    if (existing.status !== 'pending') {
        return res.status(400).json({
            success: false,
            error: 'Can only edit pending messages'
        });
    }
    
    const { recipient, message, scheduledTime, repeat } = req.body;
    
    if (recipient) existing.recipient = recipient;
    if (message) existing.message = message;
    if (scheduledTime) existing.scheduledTime = new Date(scheduledTime).toISOString();
    if (repeat) existing.repeat = repeat;
    
    existing.updatedAt = new Date().toISOString();
    
    res.json({
        success: true,
        message: existing
    });
});

// Cancel/delete a scheduled message
app.delete('/api/messages/:id', (req, res) => {
    const index = scheduledMessages.findIndex(m => m.id === req.params.id);
    
    if (index === -1) {
        return res.status(404).json({
            success: false,
            error: 'Message not found'
        });
    }
    
    const removed = scheduledMessages.splice(index, 1)[0];
    console.log(`🗑️ Message ${removed.id} cancelled`);
    
    res.json({
        success: true,
        message: 'Message cancelled successfully'
    });
});

// Send a message immediately (for testing)
app.post('/api/send', async (req, res) => {
    const { recipient, message } = req.body;
    
    if (!isConnected) {
        return res.status(400).json({
            success: false,
            error: 'WhatsApp is not connected'
        });
    }
    
    try {
        const chatId = formatPhoneNumber(recipient);
        await client.sendMessage(chatId, message);
        
        console.log(`✉️ Message sent to ${recipient}`);
        
        res.json({
            success: true,
            message: 'Message sent successfully'
        });
    } catch (error) {
        console.error('Send error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send message: ' + error.message
        });
    }
});

// Disconnect WhatsApp (logout)
app.post('/api/disconnect', async (req, res) => {
    try {
        await client.logout();
        isConnected = false;
        connectedPhone = null;
        currentQR = null;
        
        res.json({
            success: true,
            message: 'Disconnected successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to disconnect'
        });
    }
});

// ===================
// HELPER FUNCTIONS
// ===================

/**
 * Format phone number to WhatsApp chat ID format
 * @param {string} phone - Phone number (e.g., +919876543210)
 * @returns {string} WhatsApp chat ID (e.g., 919876543210@c.us)
 */
function formatPhoneNumber(phone) {
    // Remove all non-numeric characters except +
    let cleaned = phone.replace(/[^0-9+]/g, '');
    
    // Remove leading +
    if (cleaned.startsWith('+')) {
        cleaned = cleaned.substring(1);
    }
    
    // Add @c.us suffix for WhatsApp
    return `${cleaned}@c.us`;
}

/**
 * Send a WhatsApp message with retry logic
 * @param {object} msgData - Message data object
 */
async function sendWhatsAppMessage(msgData) {
    if (!isConnected) {
        console.log('⚠️ Cannot send message - WhatsApp not connected');
        msgData.status = 'failed';
        msgData.error = 'WhatsApp not connected';
        return false;
    }
    
    const maxRetries = 3;
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Check if client is still connected
            const state = await client.getState();
            if (state !== 'CONNECTED') {
                throw new Error(`Client state is ${state}, not CONNECTED`);
            }
            
            const chatId = formatPhoneNumber(msgData.recipient);
            await client.sendMessage(chatId, msgData.message);
            
            msgData.status = 'sent';
            msgData.sentAt = new Date().toISOString();
            
            console.log(`✅ Message sent to ${msgData.recipient}`);
            
            // Handle repeat scheduling
            if (msgData.repeat && msgData.repeat !== 'none') {
                scheduleNextRepeat(msgData);
            }
            
            return true;
        } catch (error) {
            lastError = error;
            console.error(`❌ Attempt ${attempt}/${maxRetries} failed for ${msgData.recipient}:`, error.message);
            
            // If session closed, try to reconnect
            if (error.message.includes('Session closed') || error.message.includes('Protocol error')) {
                console.log('🔄 Session error detected, attempting reconnect...');
                isConnected = false;
                
                try {
                    await client.destroy();
                } catch (e) {
                    // Ignore destroy errors
                }
                
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                try {
                    await client.initialize();
                    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait for reconnect
                } catch (e) {
                    console.error('Reconnect failed:', e.message);
                }
            } else {
                // Wait before retry for other errors
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            }
        }
    }
    
    // All retries failed
    console.error(`❌ All ${maxRetries} attempts failed for ${msgData.recipient}:`, lastError?.message);
    msgData.status = 'failed';
    msgData.error = lastError?.message || 'Unknown error';
    return false;
}

/**
 * Schedule the next occurrence for repeating messages
 * @param {object} msgData - Original message data
 */
function scheduleNextRepeat(msgData) {
    const nextTime = new Date(msgData.scheduledTime);
    
    switch (msgData.repeat) {
        case 'daily':
            nextTime.setDate(nextTime.getDate() + 1);
            break;
        case 'weekly':
            nextTime.setDate(nextTime.getDate() + 7);
            break;
        case 'monthly':
            nextTime.setMonth(nextTime.getMonth() + 1);
            break;
        default:
            return;
    }
    
    const newMessage = {
        id: uuidv4(),
        recipient: msgData.recipient,
        message: msgData.message,
        scheduledTime: nextTime.toISOString(),
        repeat: msgData.repeat,
        status: 'pending',
        createdAt: new Date().toISOString(),
        parentId: msgData.id
    };
    
    scheduledMessages.push(newMessage);
    console.log(`🔄 Next ${msgData.repeat} message scheduled for ${nextTime.toLocaleString()}`);
}

// ===================
// SCHEDULER
// ===================

// Check for pending messages every minute
cron.schedule('* * * * *', async () => {
    const now = new Date();
    const pendingMessages = scheduledMessages.filter(m => 
        m.status === 'pending' && 
        new Date(m.scheduledTime) <= now
    );
    
    for (const msg of pendingMessages) {
        console.log(`⏰ Time to send message to ${msg.recipient}`);
        await sendWhatsAppMessage(msg);
    }
});

// Cleanup old sent/failed messages daily (keep last 7 days)
cron.schedule('0 0 * * *', () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const before = scheduledMessages.length;
    scheduledMessages = scheduledMessages.filter(m => 
        m.status === 'pending' || 
        new Date(m.createdAt) > sevenDaysAgo
    );
    
    const removed = before - scheduledMessages.length;
    if (removed > 0) {
        console.log(`🧹 Cleaned up ${removed} old messages`);
    }
});

// ===================
// START SERVER
// ===================

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   WhatsApp Scheduler Backend                              ║
║   Server running on port ${PORT}                            ║
║                                                           ║
║   Endpoints:                                              ║
║   • GET  /api/status    - Connection status               ║
║   • GET  /api/qr        - Get QR code for auth            ║
║   • POST /api/schedule  - Schedule a message              ║
║   • GET  /api/messages  - List all messages               ║
║   • DELETE /api/messages/:id - Cancel a message           ║
║   • POST /api/send      - Send message immediately        ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received. Shutting down gracefully...');
    await client.destroy();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received. Shutting down gracefully...');
    await client.destroy();
    process.exit(0);
});
