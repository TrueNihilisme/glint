/**
 * Glint extension: Lampac's SISI section (adult) — adds «ТВ → Полуничка».
 *
 * Behind a PIN when one is set in the extension's settings: it is asked once per start of Glint.
 * Rows: one per chosen site (the first page of its list); Enter on a video plays the best quality Lampac gives.
 * Lampac writes its own address into links (often https://<ip>:<port>); they are rewritten to the address set here.
 *
 * Add in Glint: Settings → Extensions → Add → the address of this file, then set «Адреса Lampac» and a PIN.
 * ES5 on purpose: Glint runs extension files as they are on Chromium 56 (Samsung Tizen 4).
 */
(function () {
    'use strict';

    var unlocked = false;
    var origin = '';

    function server(ctx) { return String(ctx.get('server') || '').replace(/\/+$/, ''); }
    function originOf(url) { var m = /^(https?:\/\/[^\/]+)/.exec(url || ''); return m ? m[1] : ''; }
    function local(ctx, url) {
        url = String(url || '');
        if (origin && url.indexOf(origin) === 0) return server(ctx) + url.slice(origin.length);
        if (url.charAt(0) === '/') return server(ctx) + url;
        return url;
    }

    function unlock(ctx) {
        var pin = String(ctx.get('pin') || '');
        if (!pin || unlocked) return Promise.resolve(true);
        return ctx.ask('PIN-код для «Полунички»', '', '').then(function (v) {
            unlocked = v === pin;
            if (v != null && !unlocked) ctx.toast('Невірний PIN-код');
            return unlocked;
        });
    }

    function best(q) {
        var keys = Object.keys(q || {});
        keys.sort(function (a, b) { return (parseInt(b, 10) || 0) - (parseInt(a, 10) || 0); });
        return keys.length ? q[keys[0]] : '';
    }

    Glint.register({
        id: 'sisi',
        name: 'Полуничка (SISI)',
        version: '0.1.0',
        settings: [
            { key: 'server', title: 'Адреса Lampac', type: 'text', placeholder: 'http://<host>:9118' },
            { key: 'pin', title: 'PIN-код (порожньо — без PIN)', type: 'text' },
            { key: 'sites', title: 'Сайти через кому (порожньо — перші три)', type: 'text' }
        ],
        menu: [{ id: 'tv', title: 'ТВ', items: [{ id: 'sisi', title: 'Полуничка' }] }],
        page: function (menuId, itemId, ctx) {
            if (!server(ctx)) return Promise.resolve({ rows: [], note: 'Задайте адресу Lampac: Налаштування → Розширення → Полуничка (SISI)' });
            return unlock(ctx).then(function (ok) {
                if (!ok) return { rows: [], note: 'Розділ закритий PIN-кодом' };
                return ctx.getJSON(server(ctx) + '/sisi?rjson=true', 20000).then(function (d) {
                    var all = (d.channels || []).filter(function (c) { return c.playlist_url && !/\/sisi\/bookmarks/.test(c.playlist_url); });
                    if (all[0]) origin = originOf(all[0].playlist_url);
                    var wanted = String(ctx.get('sites') || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
                    var chosen = wanted.length
                        ? all.filter(function (c) { return wanted.indexOf(String(c.title).toLowerCase()) >= 0; })
                        : all.slice(0, 3);
                    return Promise.all(chosen.map(function (c) {
                        return ctx.getJSON(local(ctx, c.playlist_url), 25000).then(function (p) {
                            return {
                                title: c.title, style: 'wide',
                                items: (p.list || []).map(function (v, i) {
                                    return { id: 'sisi-' + c.title + '-' + i, title: v.name || '', meta: [v.time, v.quality].filter(Boolean).join(' · '),
                                        card: v.picture || '', backdrop: '', video: v.video };
                                })
                            };
                        }).catch(function () { return null; });
                    })).then(function (rows) {
                        rows = rows.filter(Boolean);
                        return { rows: rows, note: rows.length ? '' : 'Сайти не відповіли' };
                    });
                });
            });
        },
        open: function (item, ctx) {
            return ctx.getJSON(local(ctx, item.video), 25000).then(function (d) {
                var url = best(d.qualitys);
                if (!url) throw new Error('нема потоку');
                return { stream: local(ctx, url) };
            });
        }
    });
})();
