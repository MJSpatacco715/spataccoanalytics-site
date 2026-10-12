<?php
/**
 * Stand-in for the source platform's api.php, used only to render its depth
 * chart page for a screenshot (php -S -t <source>/site capture/stub_api.php).
 *
 * Serves the source repo's own data files. No database, no network, no
 * sign-in, and nothing league-specific: rosters are empty, so no ownership
 * column has anything to show. Every other request is a static file.
 */
$site = getenv('SOURCE_SITE_DIR') ?: '';
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (!preg_match('#/api\.php$#', $path)) {
    return false;
}
header('Content-Type: application/json');
header('Cache-Control: no-store');

function read_private(string $site, string $file): array
{
    $p = "$site/private/$file";
    $d = is_readable($p) ? json_decode((string) file_get_contents($p), true) : null;
    return is_array($d) ? $d : [];
}

switch ($_GET['action'] ?? '') {
    case 'me':
        // A signed-in reader with no league identity, so the page draws its
        // full charts rather than the signed-out link list.
        echo json_encode(['ok' => true, 'user' => ['member_id' => 1, 'display_name' => 'Viewer', 'is_commissioner' => 0]]);
        break;
    case 'depth_chart':
        echo json_encode(['ok' => true] + read_private($site, 'depth-chart.json'));
        break;
    case 'madden_index':
        echo json_encode(['ok' => true] + read_private($site, 'madden-index.json'));
        break;
    case 'madden_player':
        $all = read_private($site, 'madden.json');
        $one = $all['players'][$_GET['player'] ?? ''] ?? null;
        echo json_encode($one ? ['ok' => true, 'player' => $one] : ['ok' => false]);
        break;
    case 'league_rosters':
        echo json_encode(['ok' => true, 'teams' => []]);
        break;
    case 'injuries':
        echo json_encode(['ok' => true, 'injuries' => [], 'events' => []]);
        break;
    default:
        echo json_encode(['ok' => true]);
}
