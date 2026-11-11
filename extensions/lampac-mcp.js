/**
 * Glint extension: rows from lampac-mcp.
 *
 * Takes the rows lampac-mcp keeps for the Lampa main screen (GET <lampac-mcp>/api/collection) and gives them to
 * Glint's sections by their `kind`: movies → Фільми, series → Серіали, cartoons → Мультфільми, anime → Аніме.
 * A row's `style` (poster / wide) becomes the card shape. Pictures come from TMDB's image CDN.
 *
 * Add in Glint: Settings → Extensions → Add → the address of this file, then set «Адреса lampac-mcp».
 * ES5 on purpose: Glint runs extension files as they are on Chromium 56 (Samsung Tizen 4).
 */
(function () {
    'use strict';

    var IMG = 'https://image.tmdb.org/t/p/';
    var KIND = { movies: 'movies', series: 'series', cartoons: 'cartoons', anime: 'anime' };
    var cache = null;

    function collection(ctx) {
        var server = String(ctx.get('server') || '').replace(/\/+$/, '');
        if (!server) return Promise.resolve(null);
        if (!cache) {
            cache = ctx.getJSON(server + '/api/collection').catch(function (e) { cache = null; throw e; });
        }
        return cache;
    }

    function item(it, style) {
        var type = it.media_type === 'tv' ? 'tv' : 'movie';
        return {
            id: type + it.id,
            title: it.title || it.name || '',
            card: style === 'poster'
                ? (it.poster_path ? IMG + 'w342' + it.poster_path : '')
                : (it.backdrop_path ? IMG + 'w300' + it.backdrop_path : ''),
            backdrop: it.backdrop_path ? IMG + 'w1280' + it.backdrop_path : '',
            tmdb: { id: it.id, type: type }
        };
    }

    Glint.register({
        id: 'lampac-mcp',
        name: 'Ряди lampac-mcp',
        version: '0.1.0',
        settings: [
            { key: 'server', title: 'Адреса lampac-mcp', type: 'text', placeholder: 'http://<host>:8787' }
        ],
        rows: function (section, ctx) {
            var kind = KIND[section];
            if (!kind) return Promise.resolve([]);
            return collection(ctx).then(function (d) {
                if (!d) return [];
                return (d.rows || []).filter(function (r) { return r.kind === kind; }).map(function (r) {
                    var style = r.style === 'poster' ? 'poster' : 'wide';
                    return {
                        title: r.title,
                        ai: true,
                        style: style,
                        items: (r.items || []).map(function (it) { return item(it, style); })
                    };
                });
            });
        }
    });
})();
