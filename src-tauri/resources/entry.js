function handleLinkClick(el) {
    if (!(el instanceof HTMLAnchorElement)) {
        return;
    }
    var href = el.getAttribute('href') || '';
    let matched;
    if ((matched = href.match(/^entry:\/\/([^#]*)(#.*)?$/))) {
        // todo redirect with hash
        if (matched[1]) {
            var url = new URL(location.href);
            window.location.href =
                '/@entry?dict_id=' +
                url.searchParams.get('dict_id') +
                '&name=' +
                encodeURIComponent(matched[1]);
        }
        if (!matched[1] && matched[2]) {
            location.hash = matched[2];
        }
    } else if ((matched = href.match(/^sound:\/\/(.+)/))) {
        var audio = document.createElement('audio');
        audio.src = '/@resource?name=' + encodeURIComponent(matched[1]);
        audio.play();
    }
}
document.addEventListener('DOMContentLoaded', () => {
    document
        .querySelectorAll('a[href^="entry://"], a[href^="sound://"]')
        .forEach((el) => {
            el.addEventListener('click', (e) => {
                e.preventDefault();
                handleLinkClick(el);
            });
        });
});
