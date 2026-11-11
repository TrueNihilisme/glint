/**
 * Glint extension: sources from a Lampac server (online balancers, incl. the EX modules of this repo).
 *
 * sources(): GET <lampac>/lite/events — the list of sources for a title.
 * play():    walks the source's answers with rjson=true — similar → season → episode (+ voice) or movie —
 *            until there is a stream address. Links Lampac gives point at its own address as Lampac sees it
 *            (often https://<ip>:<port>); they are rewritten to the address set here, which the TV can reach.
 * Sources that answer {"rch": true} need the TV to fetch the site itself (RCH): the extension opens Lampac's
 * WebSocket (<lampac>/nws), registers, does the HTTP requests Lampac asks for and posts the answers back to
 * <lampac>/rch/result, then asks the source again. Lampac may also ask a client to run JavaScript it sends
 * ("eval") — this extension never does that and answers with an empty string.
 *
 * Add in Glint: Settings → Extensions → Add → the address of this file, then set «Адреса Lampac».
 * ES5 on purpose: Glint runs extension files as they are on Chromium 56 (Samsung Tizen 4).
 */
(function () {
    'use strict';

    var lampacOrigin = '';   // the origin Lampac writes into its own links, learned from /lite/events

    function server(ctx) { return String(ctx.get('server') || '').replace(/\/+$/, ''); }

    function query(item) {
        var serial = item.tmdb && item.tmdb.type === 'tv' ? 1 : 0;
        var p = {
            id: item.tmdb ? item.tmdb.id : '', imdb_id: item.imdb || '', kinopoisk_id: '',
            title: item.title || '', original_title: item.original || '', original_language: item.lang || '',
            year: item.year || '', source: 'tmdb', serial: serial, rjson: 'true'
        };
        return Object.keys(p).map(function (k) { return k + '=' + encodeURIComponent(p[k]); }).join('&');
    }

    // Lampac's own links → the address set in Glint
    function local(ctx, url) {
        url = String(url || '');
        var s = server(ctx);
        if (lampacOrigin && url.indexOf(lampacOrigin) === 0) return s + url.slice(lampacOrigin.length);
        if (url.charAt(0) === '/') return s + url;
        return url;
    }
    function withJson(url) { return /[?&]rjson=/.test(url) ? url : url + (url.indexOf('?') < 0 ? '?' : '&') + 'rjson=true'; }

    function originOf(url) { var m = /^(https?:\/\/[^\/]+)/.exec(url || ''); return m ? m[1] : ''; }

    function streamOf(m) {
        if (m.url) return m.url;
        var q = m.quality || {};
        var keys = Object.keys(q).sort(function (a, b) { return parseInt(b, 10) - parseInt(a, 10); });
        return keys.length ? q[keys[0]] : '';
    }

    function choose(list, item) {
        var year = String(item.year || '');
        return list.filter(function (x) { return year && String(x.year || '') === year; })[0] || list[0] || null;
    }

    // ── RCH ──
    var rch = { ready: null, ws: null, ping: 0 };

    function uid() {
        var s = '';
        while (s.length < 32) s += Math.random().toString(36).slice(2);
        return s.slice(0, 32);
    }
    function form(data) {
        if (typeof data === 'string') return data;
        return Object.keys(data).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(data[k]); }).join('&');
    }

    // Lampac asks: fetch this url (GET, or POST with data) and send me the text
    function rchRequest(ctx, args) {
        var rchId = args[0], url = args[1], data = args[2], headers = args[3] || {};
        function answer(text) {
            ctx.request('POST', server(ctx) + '/rch/result?id=' + encodeURIComponent(rchId), text || '', { 'Content-Type': 'text/plain' }, 15000)
                .catch(function () { /* Lampac will time out on its side */ });
        }
        if (url === 'ping') { answer('pong'); return; }
        if (url === 'eval' || url === 'evalrun') { answer(''); return; }   // never run code sent by a server
        var body = data == null || data === '' ? null : form(data);
        var h = {};
        Object.keys(headers).forEach(function (k) { h[k] = headers[k]; });
        if (body && !h['Content-Type'] && !h['content-type']) h['Content-Type'] = 'application/x-www-form-urlencoded';
        ctx.request(body ? 'POST' : 'GET', url, body, h, 8000).then(function (r) { answer(r.text); }, function () { answer(''); });
    }

    function rchConnect(ctx) {
        if (rch.ready) return rch.ready;
        var id = ctx.get('nws_id');
        if (!id) { id = uid(); ctx.set('nws_id', id); }
        var url = server(ctx).replace(/^http/, 'ws') + '/nws?id=' + id + '&ver=1';
        rch.ready = new Promise(function (resolve, reject) {
            var ws;
            var timer = setTimeout(function () { reset(); reject(new Error('RCH: Lampac не відповів')); }, 10000);
            function reset() { rch.ready = null; clearInterval(rch.ping); try { ws.close(); } catch (e) { /* closed */ } }
            try { ws = new WebSocket(url); } catch (e) { clearTimeout(timer); rch.ready = null; reject(e); return; }
            rch.ws = ws;
            ws.onmessage = function (ev) {
                if (ev.data === 'pong') return;
                var m;
                try { m = JSON.parse(ev.data); } catch (e) { return; }
                if (!m || !m.method) return;
                if (m.method === 'Connected') {
                    ws.send(JSON.stringify({ method: 'RchRegistry', args: [{ host: '', rchtype: 'cors', apkVersion: 0, player: 'inner' }] }));
                } else if (m.method === 'RchRegistry') {
                    clearTimeout(timer);
                    resolve();
                } else if (m.method === 'RchClient') {
                    rchRequest(ctx, m.args || []);
                }
            };
            ws.onclose = function () { clearTimeout(timer); rch.ready = null; clearInterval(rch.ping); };
            rch.ping = setInterval(function () { try { ws.send('ping'); } catch (e) { /* closed */ } }, 50000);
        });
        return rch.ready;
    }

    // Lampac ties a source request to the RCH WebSocket by this id (Lampac's own online.js adds it the same way)
    function withNws(ctx, url) {
        var id = ctx.get('nws_id');
        if (!id || url.indexOf('nws_id=') >= 0) return url;
        return url + (url.indexOf('?') < 0 ? '?' : '&') + 'nws_id=' + encodeURIComponent(id);
    }

    function walk(ctx, item, url, opt, depth) {
        if (depth > 6) return Promise.reject(new Error('забагато переходів'));
        // some sources answer plain text ("exact match not found…") instead of JSON — that means nothing found
        return ctx.request('GET', withNws(ctx, local(ctx, url)), null, null, 30000).then(function (r) {
            if (r.status < 200 || r.status >= 300) throw new Error('HTTP ' + r.status);
            var page;
            try { page = JSON.parse(r.text); } catch (e) { return null; }
            return page;
        }).then(function (page) {
            if (!page) return null;
            if (page.rch) {
                if (opt.rchTries >= 2) throw new Error('джерело через RCH не відповіло');
                opt.rchTries = (opt.rchTries || 0) + 1;
                return rchConnect(ctx).then(function () { return walk(ctx, item, url, opt, depth + 1); });
            }
            var data = page.data || [];
            var voiceList = page.voice || [];
            var voices = voiceList.map(function (v) { return v.name; });

            if (page.type === 'similar') {
                var pick = choose(data, item);
                return pick ? walk(ctx, item, withJson(pick.url), opt, depth + 1) : null;
            }
            if (page.type === 'season') {
                var s = data.filter(function (x) { return +x.id === opt.season || +x.name === opt.season; })[0] || (data.length === 1 ? data[0] : null);
                if (!s) throw new Error('нема сезону ' + opt.season);
                return walk(ctx, item, withJson(s.url), opt, depth + 1);
            }
            if (page.type === 'episode') {
                if (opt.voice && !opt.voiceTried) {
                    var v = voiceList.filter(function (x) { return x.name === opt.voice; })[0];
                    if (v && !v.active && v.url) { opt.voiceTried = true; return walk(ctx, item, withJson(v.url), opt, depth + 1); }
                }
                var ep = data.filter(function (x) { return +x.e === opt.episode; })[0];
                if (!ep) throw new Error('нема серії ' + opt.episode);
                var active = voiceList.filter(function (x) { return x.active; })[0];
                return { url: local(ctx, streamOf(ep)), voices: voices, voice: active ? active.name : (opt.voice || voices[0]) };
            }
            if (page.type === 'movie') {
                var plays = data.filter(function (x) { return x.method === 'play' || x.method === 'call'; });
                var names = plays.map(function (x) { return x.translate || x.title || ''; });
                var m = (opt.voice && plays.filter(function (x) { return (x.translate || x.title) === opt.voice; })[0]) || plays[0];
                if (!m) return null;
                var res = { voices: names, voice: m.translate || m.title || '' };
                if (m.method === 'call') {
                    return ctx.getJSON(local(ctx, m.url), 20000).then(function (r) { res.url = local(ctx, streamOf(r)); return res; });
                }
                res.url = local(ctx, streamOf(m));
                return res;
            }
            return null;
        });
    }

    Glint.register({
        id: 'lampac',
        name: 'Lampac',
        version: '0.1.0',
        settings: [
            { key: 'server', title: 'Адреса Lampac', type: 'text', placeholder: 'http://<host>:9118' }
        ],
        sources: function (item, ctx) {
            var s = server(ctx);
            if (!s) return Promise.resolve([]);
            return ctx.getJSON(s + '/lite/events?' + query(item), 30000).then(function (list) {
                list = (list || []).filter(function (x) { return x.show !== false; });
                if (list[0]) lampacOrigin = originOf(list[0].url);
                return list.map(function (x) { return { id: x.balanser, name: x.name, note: '' }; });
            });
        },
        play: function (item, sourceId, opt, ctx) {
            var s = server(ctx);
            if (!s) return Promise.reject(new Error('не задано адресу Lampac'));
            var o = { season: opt.season, episode: opt.episode, voice: opt.voice };
            return walk(ctx, item, s + '/lite/' + encodeURIComponent(sourceId) + '?' + query(item), o, 0);
        }
    });
})();
