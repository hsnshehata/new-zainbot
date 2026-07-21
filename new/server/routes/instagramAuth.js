const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const Bot = require('../models/Bot');
const logger = require('../logger');

// مسار الـ Callback لإنستجرام
router.get('/callback', async (req, res) => {
    const { code, state, error, error_reason, error_description } = req.query;

    // إذا رفض المستخدم المصادقة أو حدث خطأ
    if (error) {
        logger.error('❌ Instagram OAuth Error:', { error, error_reason, error_description });
        return res.redirect(`/dashboard_new.html#channels?error=instagram_auth_failed&reason=${encodeURIComponent(error_description || '')}`);
    }

    if (!code || !state) {
        logger.error('❌ Missing code or state in Instagram callback');
        return res.redirect('/dashboard_new.html#channels?error=missing_parameters');
    }

    try {
        // فك تشفير الـ state
        let stateData;
        try {
            stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
        } catch (e) {
            logger.error('❌ Failed to parse state', { error: e.message });
            return res.redirect('/dashboard_new.html#channels?error=invalid_state');
        }

        const { botId, token } = stateData;

        // التحقق من صحة توكن المستخدم
        let decodedUser;
        try {
            decodedUser = jwt.verify(token, process.env.JWT_SECRET);
        } catch (e) {
            logger.error('❌ Invalid user token in state', { error: e.message });

            if (stateData.popup) {
                return res.send(`
                    <script>
                        if (window.opener) {
                            window.opener.postMessage('instagram_auth_error:invalid_token', '*');
                        } else {
                            window.location.href = '/dashboard_new.html#channels?error=invalid_token';
                        }
                    </script>
                `);
            }
            return res.redirect('/dashboard_new.html#channels?error=invalid_token');
        }

        // جلب البوت للتأكد منه
        const bot = await Bot.findById(botId);
        if (!bot) {
            if (stateData.popup) {
                return res.send(`<script>if (window.opener) window.opener.postMessage('instagram_auth_error:bot_not_found', '*'); else window.location.href = '/dashboard_new.html#channels?error=bot_not_found';</script>`);
            }
            return res.redirect('/dashboard_new.html#channels?error=bot_not_found');
        }

        // التحقق من صلاحيات المستخدم على البوت
        if (decodedUser.role !== 'superadmin' && bot.userId.toString() !== decodedUser.userId.toString()) {
            if (stateData.popup) {
                return res.send(`<script>if (window.opener) window.opener.postMessage('instagram_auth_error:unauthorized', '*'); else window.location.href = '/dashboard_new.html#channels?error=unauthorized';</script>`);
            }
            return res.redirect('/dashboard_new.html#channels?error=unauthorized');
        }

        // تجهيز الـ redirect_uri اللي لازم يكون مطابق للي اتبعث في الأول
        // استخدام BASE_URL من الـ env أو نعتمد على الهوست اللي جاي منه الطلب
        const host = process.env.BASE_URL || `https://${req.get('host')}`;
        const redirectUri = `${host}/api/instagram/callback`;

        logger.info('🔄 Exchanging code for Instagram access token', { botId, redirectUri });

        // 1. تبديل الـ code بـ short-lived access token
        const tokenForm = new URLSearchParams();
        tokenForm.append('client_id', process.env.INSTAGRAM_APP_ID || '2288330081539329');
        tokenForm.append('client_secret', process.env.INSTAGRAM_APP_SECRET);
        tokenForm.append('grant_type', 'authorization_code');
        tokenForm.append('redirect_uri', redirectUri);
        tokenForm.append('code', code);

        const tokenResponse = await axios.post('https://api.instagram.com/oauth/access_token', tokenForm.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        let { access_token, user_id } = tokenResponse.data;

        // 2. محاولة تبديل الـ short-lived لـ long-lived 
        // إذا كنت بتستخدم Instagram Graph API فبتحتاج توكن طويل المدى
        try {
            const longLivedResponse = await axios.get(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.INSTAGRAM_APP_SECRET}&access_token=${access_token}`);
            if (longLivedResponse.data && longLivedResponse.data.access_token) {
                access_token = longLivedResponse.data.access_token;
                logger.info('✅ Super-charged to long-lived token', { botId });
            }
        } catch (longLivedErr) {
            logger.warn('⚠️ Could not exchange for long-lived token, will use short-lived', { err: longLivedErr.response?.data || longLivedErr.message });
            // نستمر في العمل بالقصيرة المدى إذا فشلنا
        }

        // 3. Get the correct Instagram Page ID from Graph API
        // This is necessary because the user_id returned by OAuth is the App-Scoped ID.
        // We need the Global Instagram ID (used in Webhooks), which is available as 'user_id' in the /me endpoint.
        let correctPageId = user_id;
        try {
            const meResponse = await axios.get(`https://graph.instagram.com/v20.0/me?fields=id,user_id&access_token=${access_token}`);
            if (meResponse.data && meResponse.data.user_id) {
                correctPageId = meResponse.data.user_id; // Standard global ID for IG Accounts
                logger.info('✅ Fetched correct Global Graph API ID for Webhooks', { botId, correctPageId });
            } else if (meResponse.data && meResponse.data.id) {
                correctPageId = meResponse.data.id;
            }
        } catch (meErr) {
            logger.warn('⚠️ Could not fetch Graph API ID, falling back to OAuth user_id', { err: meErr.response?.data || meErr.message });
        }

        // 4. تخزين الداتا في البوت
        bot.instagramApiKey = access_token;
        bot.instagramPageId = correctPageId;
        bot.lastInstagramTokenRefresh = new Date();
        await bot.save();

        logger.info('✅ Successfully linked Instagram Account', { botId, instagramPageId: correctPageId });

        if (stateData.popup) {
            // Return HTML that communicates with the opener window
            return res.send(`
                <script>
                    if (window.opener) {
                        window.opener.postMessage('instagram_auth_success', '*');
                    } else {
                        window.location.href = '/dashboard_new.html#channels';
                    }
                </script>
            `);
        }

        // إعادة المستخدم إلى الداشبورد مع رسالة نجاح
        return res.redirect(`/dashboard_new.html#channels?botId=${botId}&success=instagram_linked`);

    } catch (error) {
        logger.error('❌ Error during Instagram authentication', {
            error: error.response?.data || error.message,
            stack: error.stack
        });

        let stateData;
        try {
            stateData = JSON.parse(Buffer.from(req.query.state, 'base64').toString('utf8'));
        } catch (e) { }

        if (stateData && stateData.popup) {
            return res.send(`
                <script>
                    if (window.opener) {
                        window.opener.postMessage('instagram_auth_error:instagram_auth_server_error', '*');
                    } else {
                        window.location.href = '/dashboard_new.html#channels?error=instagram_auth_server_error';
                    }
                </script>
            `);
        }

        return res.redirect('/dashboard_new.html#channels?error=instagram_auth_server_error');
    }
});

module.exports = router;
