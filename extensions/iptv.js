/**
 * Glint extension: TV channels from an M3U playlist — adds «ТВ → IPTV» to the menu.
 *
 * Reads #EXTINF lines (tvg-id, tvg-logo, group-title, the name after the last comma) and the stream address on
 * the next line. Channels are grouped by group-title, 20 to a row. Enter on a channel plays it in Glint's player.
 *
 * Optional programme guide, a small JSON: { "ch": { "<id>": [[start, end, "title"], …] } } (Unix seconds);
 * <id> is the channel's tvg-id or its digits. With it each card shows what is on now.
 *
 * Add in Glint: Settings → Extensions → Add → the address of this file, then set the playlist address.
 * ES5 on purpose: Glint runs extension files as they are on Chromium 56 (Samsung Tizen 4).
 */
(function () {
    'use strict';

    var PER_ROW = 20;

    function attrs(line) {
        var out = {}, re = /([\w-]+)="([^"]*)"/g, m;
        while ((m = re.exec(line))) out[m[1].toLowerCase()] = m[2];
        return out;
    }

    function parse(text) {
        var lines = String(text || '').split(/\r?\n/), list = [], cur = null;
        for (var i = 0; i < lines.length; i++) {
            var l = lines[i].trim();
            if (!l) continue;
            if (l.indexOf('#EXTINF') === 0) {
                var a = attrs(l);
                cur = { name: l.slice(l.lastIndexOf(',') + 1).trim(), id: a['tvg-id'] || '', logo: a['tvg-logo'] || '', group: a['group-title'] || 'Канали' };
            } else if (l.charAt(0) !== '#' && cur) {
                cur.url = l;
                list.push(cur);
                cur = null;
            }
        }
        return list;
    }

    function hhmm(sec) {
        var d = new Date(sec * 1000), h = d.getHours(), m = d.getMinutes();
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }

    function nowOn(epg, ch) {
        if (!epg || !epg.ch) return '';
        var list = epg.ch[ch.id] || epg.ch[String(ch.id).replace(/\D/g, '')];
        if (!list) return '';
        var now = Date.now() / 1000;
        for (var i = 0; i < list.length; i++) {
            if (list[i][0] <= now && now < list[i][1]) return list[i][2] + ' · ' + hhmm(list[i][0]) + '–' + hhmm(list[i][1]);
        }
        return '';
    }

    Glint.register({
        id: 'iptv',
        name: 'IPTV (M3U)',
        version: '0.1.0',
        settings: [
            { key: 'm3u', title: 'Плейлист M3U', type: 'text', placeholder: 'http://…/playlist.m3u' },
            { key: 'epg', title: 'Програма передач (JSON, необовʼязково)', type: 'text', placeholder: 'http://…/epg.json' }
        ],
        menu: [{ id: 'tv', title: 'ТВ', items: [{ id: 'iptv', title: 'IPTV' }] }],
        page: function (menuId, itemId, ctx) {
            var m3u = ctx.get('m3u');
            if (!m3u) return Promise.resolve({ rows: [], note: 'Задайте адресу плейлиста: Налаштування → Розширення → IPTV (M3U)' });
            var epgUrl = ctx.get('epg');
            return Promise.all([
                ctx.request('GET', m3u, null, null, 20000),
                epgUrl ? ctx.getJSON(epgUrl, 20000).catch(function () { return null; }) : Promise.resolve(null)
            ]).then(function (r) {
                if (r[0].status < 200 || r[0].status >= 300) throw new Error('плейлист: HTTP ' + r[0].status);
                var channels = parse(r[0].text), epg = r[1], groups = {}, order = [];
                channels.forEach(function (ch) {
                    if (!groups[ch.group]) { groups[ch.group] = []; order.push(ch.group); }
                    groups[ch.group].push(ch);
                });
                var rows = [];
                order.forEach(function (g) {
                    var list = groups[g];
                    for (var i = 0; i < list.length; i += PER_ROW) {
                        var part = list.slice(i, i + PER_ROW);
                        rows.push({
                            title: list.length > PER_ROW ? g + ' · ' + (i + 1) + '–' + (i + part.length) : g,
                            style: 'channel',
                            items: part.map(function (ch, k) {
                                return { id: 'iptv' + (i + k) + ch.name, title: ch.name, card: ch.logo, backdrop: '', stream: ch.url, meta: nowOn(epg, ch) };
                            })
                        });
                    }
                });
                return { rows: rows, note: channels.length ? '' : 'У плейлисті нема каналів' };
            });
        }
    });
})();
