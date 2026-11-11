/**
 * Glint extension: music from Navidrome (any Subsonic / OpenSubsonic server) — adds «Музика → Navidrome».
 *
 * Rows: recently played, new albums, played most, random, playlists. Enter on an album or a playlist plays it
 * in Glint's player as a queue (← → — previous / next track).
 * Login: user name and password in the extension's settings; requests carry a token, md5(password + salt) with a
 * fresh salt each time, as the Subsonic API recommends — the password itself is never sent.
 *
 * Add in Glint: Settings → Extensions → Add → the address of this file, then set the server, user and password.
 * ES5 on purpose: Glint runs extension files as they are on Chromium 56 (Samsung Tizen 4).
 */
(function () {
    'use strict';

    // ── md5 (RFC 1321), for the Subsonic token ──
    function md5(str) {
        function add(x, y) { var l = (x & 0xffff) + (y & 0xffff); return (((x >> 16) + (y >> 16) + (l >> 16)) << 16) | (l & 0xffff); }
        function rol(n, c) { return (n << c) | (n >>> (32 - c)); }
        function cmn(q, a, b, x, s, t) { return add(rol(add(add(a, q), add(x, t)), s), b); }
        function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
        function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
        function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
        function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
        var utf8 = unescape(encodeURIComponent(str)), n = utf8.length, words = [], i;
        for (i = 0; i < n; i++) words[i >> 2] |= utf8.charCodeAt(i) << ((i % 4) * 8);
        words[n >> 2] |= 0x80 << ((n % 4) * 8);
        words[(((n + 8) >> 6) + 1) * 16 - 2] = n * 8;
        var a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
        for (i = 0; i < words.length; i += 16) {
            var oa = a, ob = b, oc = c, od = d, x = function (k) { return words[i + k] | 0; };
            a = ff(a, b, c, d, x(0), 7, -680876936); d = ff(d, a, b, c, x(1), 12, -389564586); c = ff(c, d, a, b, x(2), 17, 606105819); b = ff(b, c, d, a, x(3), 22, -1044525330);
            a = ff(a, b, c, d, x(4), 7, -176418897); d = ff(d, a, b, c, x(5), 12, 1200080426); c = ff(c, d, a, b, x(6), 17, -1473231341); b = ff(b, c, d, a, x(7), 22, -45705983);
            a = ff(a, b, c, d, x(8), 7, 1770035416); d = ff(d, a, b, c, x(9), 12, -1958414417); c = ff(c, d, a, b, x(10), 17, -42063); b = ff(b, c, d, a, x(11), 22, -1990404162);
            a = ff(a, b, c, d, x(12), 7, 1804603682); d = ff(d, a, b, c, x(13), 12, -40341101); c = ff(c, d, a, b, x(14), 17, -1502002290); b = ff(b, c, d, a, x(15), 22, 1236535329);
            a = gg(a, b, c, d, x(1), 5, -165796510); d = gg(d, a, b, c, x(6), 9, -1069501632); c = gg(c, d, a, b, x(11), 14, 643717713); b = gg(b, c, d, a, x(0), 20, -373897302);
            a = gg(a, b, c, d, x(5), 5, -701558691); d = gg(d, a, b, c, x(10), 9, 38016083); c = gg(c, d, a, b, x(15), 14, -660478335); b = gg(b, c, d, a, x(4), 20, -405537848);
            a = gg(a, b, c, d, x(9), 5, 568446438); d = gg(d, a, b, c, x(14), 9, -1019803690); c = gg(c, d, a, b, x(3), 14, -187363961); b = gg(b, c, d, a, x(8), 20, 1163531501);
            a = gg(a, b, c, d, x(13), 5, -1444681467); d = gg(d, a, b, c, x(2), 9, -51403784); c = gg(c, d, a, b, x(7), 14, 1735328473); b = gg(b, c, d, a, x(12), 20, -1926607734);
            a = hh(a, b, c, d, x(5), 4, -378558); d = hh(d, a, b, c, x(8), 11, -2022574463); c = hh(c, d, a, b, x(11), 16, 1839030562); b = hh(b, c, d, a, x(14), 23, -35309556);
            a = hh(a, b, c, d, x(1), 4, -1530992060); d = hh(d, a, b, c, x(4), 11, 1272893353); c = hh(c, d, a, b, x(7), 16, -155497632); b = hh(b, c, d, a, x(10), 23, -1094730640);
            a = hh(a, b, c, d, x(13), 4, 681279174); d = hh(d, a, b, c, x(0), 11, -358537222); c = hh(c, d, a, b, x(3), 16, -722521979); b = hh(b, c, d, a, x(6), 23, 76029189);
            a = hh(a, b, c, d, x(9), 4, -640364487); d = hh(d, a, b, c, x(12), 11, -421815835); c = hh(c, d, a, b, x(15), 16, 530742520); b = hh(b, c, d, a, x(2), 23, -995338651);
            a = ii(a, b, c, d, x(0), 6, -198630844); d = ii(d, a, b, c, x(7), 10, 1126891415); c = ii(c, d, a, b, x(14), 15, -1416354905); b = ii(b, c, d, a, x(5), 21, -57434055);
            a = ii(a, b, c, d, x(12), 6, 1700485571); d = ii(d, a, b, c, x(3), 10, -1894986606); c = ii(c, d, a, b, x(10), 15, -1051523); b = ii(b, c, d, a, x(1), 21, -2054922799);
            a = ii(a, b, c, d, x(8), 6, 1873313359); d = ii(d, a, b, c, x(15), 10, -30611744); c = ii(c, d, a, b, x(6), 15, -1560198380); b = ii(b, c, d, a, x(13), 21, 1309151649);
            a = ii(a, b, c, d, x(4), 6, -145523070); d = ii(d, a, b, c, x(11), 10, -1120210379); c = ii(c, d, a, b, x(2), 15, 718787259); b = ii(b, c, d, a, x(9), 21, -343485551);
            a = add(a, oa); b = add(b, ob); c = add(c, oc); d = add(d, od);
        }
        var out = '', hex = '0123456789abcdef', all = [a, b, c, d];
        for (i = 0; i < 16; i++) { var v = (all[i >> 2] >> ((i % 4) * 8)) & 255; out += hex.charAt(v >> 4) + hex.charAt(v & 15); }
        return out;
    }

    function server(ctx) { return String(ctx.get('server') || '').replace(/\/+$/, ''); }

    function auth(ctx) {
        var salt = Math.random().toString(36).slice(2, 10);
        return 'u=' + encodeURIComponent(ctx.get('user') || '') + '&t=' + md5(String(ctx.get('password') || '') + salt) +
            '&s=' + salt + '&v=1.16.1&c=glint&f=json';
    }

    function url(ctx, method, params) {
        var q = auth(ctx);
        Object.keys(params || {}).forEach(function (k) { q += '&' + k + '=' + encodeURIComponent(params[k]); });
        return server(ctx) + '/rest/' + method + '?' + q;
    }

    function call(ctx, method, params) {
        return ctx.getJSON(url(ctx, method, params), 20000).then(function (d) {
            var r = d && d['subsonic-response'];
            if (!r || r.status !== 'ok') throw new Error((r && r.error && r.error.message) || 'Navidrome не відповів');
            return r;
        });
    }

    function cover(ctx, id, size) { return id ? url(ctx, 'getCoverArt', { id: id, size: size }) : ''; }

    function albumItem(ctx, a) {
        return { id: 'nd-al-' + a.id, title: a.name || a.title || '', meta: a.artist || '', card: cover(ctx, a.coverArt, 300),
            backdrop: cover(ctx, a.coverArt, 1000), album: a.id };
    }

    var LISTS = [
        { type: 'recent', title: 'Нещодавно слухали' },
        { type: 'newest', title: 'Нові альбоми' },
        { type: 'frequent', title: 'Слухаю найчастіше' },
        { type: 'random', title: 'Випадкові' }
    ];

    Glint.register({
        id: 'navidrome',
        name: 'Navidrome',
        version: '0.1.0',
        settings: [
            { key: 'server', title: 'Адреса Navidrome', type: 'text', placeholder: 'http://<host>:4533' },
            { key: 'user', title: 'Користувач', type: 'text' },
            { key: 'password', title: 'Пароль', type: 'text' }
        ],
        menu: [{ id: 'music', title: 'Музика', items: [{ id: 'navidrome', title: 'Navidrome' }] }],
        page: function (menuId, itemId, ctx) {
            if (!server(ctx) || !ctx.get('user')) return Promise.resolve({ rows: [], note: 'Задайте адресу, користувача й пароль: Налаштування → Розширення → Navidrome' });
            return Promise.all(LISTS.map(function (l) {
                return call(ctx, 'getAlbumList2', { type: l.type, size: 30 }).then(function (r) {
                    var list = (r.albumList2 && r.albumList2.album) || [];
                    return { title: l.title, style: 'square', items: list.map(function (a) { return albumItem(ctx, a); }) };
                });
            }).concat([call(ctx, 'getPlaylists').then(function (r) {
                var list = (r.playlists && r.playlists.playlist) || [];
                return { title: 'Плейлисти', style: 'square', items: list.map(function (p) {
                    return { id: 'nd-pl-' + p.id, title: p.name, meta: (p.songCount || 0) + ' треків', card: cover(ctx, p.coverArt, 300),
                        backdrop: cover(ctx, p.coverArt, 1000), playlist: p.id };
                }) };
            })])).then(function (rows) { return { rows: rows }; });
        },
        // Enter on an album / playlist: a queue for the player
        open: function (item, ctx) {
            var p = item.album ? call(ctx, 'getAlbum', { id: item.album }).then(function (r) { return (r.album && r.album.song) || []; })
                : call(ctx, 'getPlaylist', { id: item.playlist }).then(function (r) { return (r.playlist && r.playlist.entry) || []; });
            return p.then(function (songs) {
                return { queue: songs.map(function (s) {
                    return { url: url(ctx, 'stream', { id: s.id }), title: s.title, sub: [s.artist, s.album].filter(Boolean).join(' · '),
                        cover: cover(ctx, s.coverArt, 600) };
                }) };
            });
        }
    });
})();
