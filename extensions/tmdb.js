/**
 * Glint extension: rows from TMDB — trends, an actor of the week, best rated, genres, studios.
 *
 * Each section gets its own set: Movies (trends, actor, best of 5 years, genres), Series (trends, best rated,
 * Korean dramas, crime, sci-fi & fantasy, British), Cartoons (new, Pixar, DreamWorks, family, kids' series,
 * adventure; anime is filtered out), Anime (new seasons, best, films, fantasy, comedy, mystery, drama, Ghibli).
 * Rows carry `order` 30+ so Glint puts them after the poster and wide rows of other extensions.
 *
 * Needs either a TMDB API key (v3) or the address of a lampac-mcp server — then requests go through its
 * GET /api/tmdb/* and the key stays on that server. ES5 on purpose: Glint runs extension files as they are on
 * Chromium 56 (Samsung Tizen 4).
 */
(function () {
    'use strict';

    var IMG = 'https://image.tmdb.org/t/p/';
    var genres = null;   // { movie: {id: name}, tv: {id: name} }
    var cache = {};

    function viaMcp(ctx) { return String(ctx.get('mcp') || '').replace(/\/+$/, ''); }
    function ready(ctx) { return !!(viaMcp(ctx) || ctx.get('key')); }

    function api(ctx, path, params) {
        var mcp = viaMcp(ctx);
        var base = mcp ? mcp + '/api/tmdb' : String(ctx.get('base') || 'https://api.themoviedb.org/3').replace(/\/+$/, '');
        var q = ['language=' + encodeURIComponent(ctx.get('lang') || 'uk-UA')];
        if (!mcp) q.push('api_key=' + encodeURIComponent(ctx.get('key') || ''));
        Object.keys(params || {}).forEach(function (k) { q.push(k + '=' + encodeURIComponent(params[k])); });
        var url = base + path + '?' + q.join('&');
        if (!cache[url]) cache[url] = ctx.getJSON(url).catch(function (e) { delete cache[url]; throw e; });
        return cache[url];
    }

    function loadGenres(ctx) {
        if (genres) return Promise.resolve(genres);
        return Promise.all([api(ctx, '/genre/movie/list'), api(ctx, '/genre/tv/list')]).then(function (r) {
            genres = { movie: {}, tv: {} };
            (r[0].genres || []).forEach(function (g) { genres.movie[g.id] = g.name; });
            (r[1].genres || []).forEach(function (g) { genres.tv[g.id] = g.name; });
            return genres;
        });
    }

    function item(it, type, style) {
        var date = it.release_date || it.first_air_date || '';
        var g = genres && genres[type] && (it.genre_ids || []).map(function (id) { return genres[type][id]; }).filter(Boolean)[0];
        return {
            id: type + it.id,
            title: it.title || it.name || '',
            year: date.slice(0, 4),
            genre: g ? g.charAt(0).toUpperCase() + g.slice(1) : '',
            desc: it.overview || '',
            card: style === 'poster' ? IMG + 'w342' + it.poster_path : IMG + 'w300' + it.backdrop_path,
            backdrop: it.backdrop_path ? IMG + 'w1280' + it.backdrop_path : '',
            tmdb: { id: it.id, type: type }
        };
    }

    // one row: a TMDB list → Glint row; items without the picture this style needs are dropped
    function row(ctx, spec) {
        return api(ctx, spec.path, spec.params || {}).then(function (d) {
            var list = (d.results || d.cast || []).filter(function (it) {
                if (spec.noAnime && it.original_language === 'ja') return false;
                return spec.style === 'poster' ? !!it.poster_path : !!it.backdrop_path;
            });
            if (spec.sort) list.sort(spec.sort);
            if (list.length < 5) return null;
            return {
                title: spec.title, style: spec.style, order: spec.order,
                items: list.slice(0, 20).map(function (it) { return item(it, spec.type, spec.style); })
            };
        }).catch(function () { return null; });
    }

    function yearsAgo(n) { var d = new Date(); d.setFullYear(d.getFullYear() - n); return d.toISOString().slice(0, 10); }
    function daysAgo(n) { return new Date(Date.now() - n * 864e5).toISOString().slice(0, 10); }

    // an actor of the week: the first person in TMDB's weekly trends who is known for acting
    function actorRow(ctx, order) {
        return api(ctx, '/trending/person/week').then(function (d) {
            var p = (d.results || []).filter(function (x) { return x.known_for_department === 'Acting'; })[0];
            if (!p) return null;
            return row(ctx, { title: 'Фільми з ' + p.name, type: 'movie', style: 'poster', order: order,
                path: '/discover/movie', params: { with_cast: p.id, sort_by: 'popularity.desc' } });
        }).catch(function () { return null; });
    }

    var SETS = {
        movies: function (ctx) {
            return [
                row(ctx, { title: 'Тренди тижня', type: 'movie', style: 'wide', order: 30, path: '/trending/movie/week' }),
                actorRow(ctx, 35),
                row(ctx, { title: 'Найкраще за 5 років', type: 'movie', style: 'poster', order: 40, path: '/discover/movie',
                    params: { sort_by: 'vote_average.desc', 'vote_count.gte': 1000, 'primary_release_date.gte': yearsAgo(5) } }),
                row(ctx, { title: 'Бойовики', type: 'movie', style: 'wide', order: 45, path: '/discover/movie', params: { with_genres: 28, sort_by: 'popularity.desc' } }),
                row(ctx, { title: 'Комедії', type: 'movie', style: 'poster', order: 50, path: '/discover/movie', params: { with_genres: 35, sort_by: 'popularity.desc' } }),
                row(ctx, { title: 'Жахи', type: 'movie', style: 'wide', order: 55, path: '/discover/movie', params: { with_genres: 27, sort_by: 'popularity.desc' } }),
                row(ctx, { title: 'Фантастика', type: 'movie', style: 'poster', order: 60, path: '/discover/movie', params: { with_genres: 878, sort_by: 'popularity.desc' } })
            ];
        },
        series: function (ctx) {
            return [
                row(ctx, { title: 'Тренди тижня', type: 'tv', style: 'wide', order: 30, path: '/trending/tv/week', noAnime: true }),
                row(ctx, { title: 'Найвищий рейтинг', type: 'tv', style: 'poster', order: 40, path: '/discover/tv',
                    params: { sort_by: 'vote_average.desc', 'vote_count.gte': 800, without_genres: 16 } }),
                row(ctx, { title: 'Корейські драми', type: 'tv', style: 'wide', order: 45, path: '/discover/tv',
                    params: { with_original_language: 'ko', with_genres: 18, sort_by: 'popularity.desc' } }),
                row(ctx, { title: 'Кримінал', type: 'tv', style: 'poster', order: 50, path: '/discover/tv', params: { with_genres: 80, sort_by: 'popularity.desc' } }),
                row(ctx, { title: 'Фантастика й фентезі', type: 'tv', style: 'wide', order: 55, path: '/discover/tv',
                    params: { with_genres: 10765, without_genres: 16, sort_by: 'popularity.desc' } }),
                row(ctx, { title: 'Британські серіали', type: 'tv', style: 'poster', order: 60, path: '/discover/tv',
                    params: { with_origin_country: 'GB', sort_by: 'popularity.desc' } })
            ];
        },
        cartoons: function (ctx) {
            return [
                row(ctx, { title: 'Нові мультфільми', type: 'movie', style: 'wide', order: 30, path: '/discover/movie', noAnime: true,
                    params: { with_genres: 16, sort_by: 'popularity.desc', 'primary_release_date.gte': yearsAgo(1) } }),
                row(ctx, { title: 'Pixar', type: 'movie', style: 'poster', order: 35, path: '/discover/movie',
                    params: { with_companies: 3, sort_by: 'popularity.desc' } }),
                row(ctx, { title: 'DreamWorks', type: 'movie', style: 'wide', order: 40, path: '/discover/movie',
                    params: { with_companies: 521, sort_by: 'popularity.desc' } }),
                row(ctx, { title: 'Для всієї родини', type: 'movie', style: 'poster', order: 45, path: '/discover/movie', noAnime: true,
                    params: { with_genres: '16,10751', sort_by: 'popularity.desc' } }),
                row(ctx, { title: 'Мультсеріали', type: 'tv', style: 'wide', order: 50, path: '/discover/tv', noAnime: true,
                    params: { with_genres: '16,10762', sort_by: 'popularity.desc' } }),
                row(ctx, { title: 'Пригоди', type: 'movie', style: 'poster', order: 55, path: '/discover/movie', noAnime: true,
                    params: { with_genres: '16,12', sort_by: 'popularity.desc' } })
            ];
        },
        anime: function (ctx) {
            var ja = function (extra) {
                var p = { with_genres: 16, with_original_language: 'ja', sort_by: 'popularity.desc' };
                Object.keys(extra || {}).forEach(function (k) { p[k] = extra[k]; });
                return p;
            };
            return [
                row(ctx, { title: 'Нові сезони', type: 'tv', style: 'wide', order: 30, path: '/discover/tv', params: ja({ 'air_date.gte': daysAgo(30) }) }),
                row(ctx, { title: 'Найкраще аніме', type: 'tv', style: 'poster', order: 35, path: '/discover/tv',
                    params: ja({ sort_by: 'vote_average.desc', 'vote_count.gte': 300 }) }),
                row(ctx, { title: 'Аніме-фільми', type: 'movie', style: 'wide', order: 40, path: '/discover/movie', params: ja() }),
                row(ctx, { title: 'Фентезі й фантастика', type: 'tv', style: 'poster', order: 45, path: '/discover/tv', params: ja({ with_genres: '16,10765' }) }),
                row(ctx, { title: 'Комедії', type: 'tv', style: 'wide', order: 50, path: '/discover/tv', params: ja({ with_genres: '16,35' }) }),
                row(ctx, { title: 'Детективи й містика', type: 'tv', style: 'poster', order: 55, path: '/discover/tv', params: ja({ with_genres: '16,9648' }) }),
                row(ctx, { title: 'Драма', type: 'tv', style: 'wide', order: 60, path: '/discover/tv', params: ja({ with_genres: '16,18' }) }),
                row(ctx, { title: 'Studio Ghibli', type: 'movie', style: 'poster', order: 65, path: '/discover/movie',
                    params: { with_companies: 10342, sort_by: 'popularity.desc' } })
            ];
        }
    };

    Glint.register({
        id: 'tmdb',
        name: 'Добірки TMDB',
        version: '0.1.0',
        settings: [
            { key: 'mcp', title: 'Адреса lampac-mcp (ключ лишається на сервері)', type: 'text', placeholder: 'http://<host>:8787' },
            { key: 'key', title: 'Або свій ключ TMDB (API v3)', type: 'text', placeholder: '32 символи з themoviedb.org' },
            { key: 'lang', title: 'Мова', type: 'text', default: 'uk-UA', placeholder: 'uk-UA' },
            { key: 'base', title: 'Адреса API', type: 'text', placeholder: 'https://api.themoviedb.org/3' }
        ],
        rows: function (section, ctx) {
            if (!ready(ctx) || !SETS[section]) return Promise.resolve([]);
            return loadGenres(ctx).catch(function () { return null; }).then(function () {
                return Promise.all(SETS[section](ctx));
            }).then(function (rows) { return rows.filter(Boolean); });
        },
        // search: films and series in two rows
        search: function (query, ctx) {
            if (!ready(ctx)) return Promise.resolve([]);
            return loadGenres(ctx).catch(function () { return null; }).then(function () {
                return api(ctx, '/search/multi', { query: query, include_adult: 'false' });
            }).then(function (d) {
                var res = d.results || [];
                function pick(type, title) {
                    var list = res.filter(function (x) { return x.media_type === type && x.poster_path; });
                    return list.length ? { title: title, style: 'poster', items: list.map(function (x) { return item(x, type, 'poster'); }) } : null;
                }
                return [pick('movie', 'Фільми'), pick('tv', 'Серіали')].filter(Boolean);
            });
        },
        // the title page: description, genres, runtime, rating, cast, director / creators, seasons
        details: function (item, ctx) {
            if (!ready(ctx) || !item.tmdb) return Promise.resolve(null);
            var t = item.tmdb.type === 'tv' ? 'tv' : 'movie';
            return api(ctx, '/' + t + '/' + item.tmdb.id, { append_to_response: 'credits,external_ids' }).then(function (d) {
                var crew = (d.credits && d.credits.crew) || [];
                var director = t === 'movie'
                    ? crew.filter(function (c) { return c.job === 'Director'; }).map(function (c) { return c.name; })[0]
                    : (d.created_by || []).map(function (c) { return c.name; }).join(', ');
                return {
                    desc: d.overview || '',
                    year: String(d.release_date || d.first_air_date || '').slice(0, 4),
                    genres: (d.genres || []).map(function (g) { return g.name.charAt(0).toUpperCase() + g.name.slice(1); }),
                    runtime: t === 'movie' ? d.runtime : (d.episode_run_time || [])[0],
                    rating: d.vote_average,
                    cast: ((d.credits && d.credits.cast) || []).slice(0, 6).map(function (c) { return c.name; }),
                    director: director || '',
                    original: d.original_title || d.original_name || '',
                    imdb: (d.external_ids && d.external_ids.imdb_id) || d.imdb_id || '',
                    lang: d.original_language || '',
                    backdrop: d.backdrop_path ? IMG + 'w1280' + d.backdrop_path : '',
                    seasons: t === 'tv' ? (d.seasons || []).filter(function (s) { return s.season_number > 0; })
                        .map(function (s) { return { n: s.season_number, count: s.episode_count }; }) : null
                };
            });
        },
        episodes: function (item, season, ctx) {
            if (!ready(ctx) || !item.tmdb || item.tmdb.type !== 'tv') return Promise.resolve(null);
            return api(ctx, '/tv/' + item.tmdb.id + '/season/' + season).then(function (d) {
                return (d.episodes || []).map(function (e) {
                    return { n: e.episode_number, name: e.name, runtime: e.runtime, still: e.still_path ? IMG + 'w300' + e.still_path : '' };
                });
            });
        }
    });
})();
