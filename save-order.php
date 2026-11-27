<?php
header('Content-Type: application/json; charset=utf-8');

function respond($status, $payload)
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(405, ['error' => 'Only POST requests are accepted.']);
}

$request = json_decode(file_get_contents('php://input'), true);
if (json_last_error() !== JSON_ERROR_NONE || !is_array($request)) {
    respond(400, ['error' => 'Request body must be valid JSON.']);
}

$fieldLimits = [
    'firstName' => 100,
    'lastName' => 100,
    'email' => 254,
    'phone' => 40,
    'address' => 250,
    'city' => 100,
    'postalCode' => 20
];
$customer = [];
foreach ($fieldLimits as $field => $limit) {
    $value = $request[$field] ?? null;
    if (!is_string($value)) {
        respond(422, ['error' => 'Complete all customer and shipping fields.']);
    }

    $value = trim($value);
    if ($value === '' || strlen($value) > $limit) {
        respond(422, ['error' => 'Customer and shipping fields must be complete and within the allowed length.']);
    }
    $customer[$field] = $value;
}

if (!filter_var($customer['email'], FILTER_VALIDATE_EMAIL)) {
    respond(422, ['error' => 'Enter a valid email address.']);
}

$paymentMethod = $request['paymentMethod'] ?? null;
if (!in_array($paymentMethod, ['cod', 'gcash'], true)) {
    respond(422, ['error' => 'Choose a supported payment method.']);
}

$catalog = [
    'poco-x8-pro' => ['name' => 'Poco X8 Pro', 'price' => 17099],
    'poco-x8-pro-max' => ['name' => 'Poco X8 Pro Max', 'price' => 25999]
];
$requestedItems = $request['items'] ?? null;
if (!is_array($requestedItems) || count($requestedItems) === 0 || count($requestedItems) > count($catalog)) {
    respond(422, ['error' => 'Select one or more valid cart items.']);
}

$items = [];
$seenItems = [];
$total = 0;
foreach ($requestedItems as $requestedItem) {
    if (!is_array($requestedItem)) {
        respond(422, ['error' => 'Cart items are invalid.']);
    }

    $id = $requestedItem['id'] ?? null;
    $quantity = $requestedItem['quantity'] ?? null;
    if (!is_string($id) || !isset($catalog[$id]) || isset($seenItems[$id])) {
        respond(422, ['error' => 'Cart contains an unknown or duplicate item.']);
    }
    if (!is_int($quantity) || $quantity < 1 || $quantity > 99) {
        respond(422, ['error' => 'Item quantities must be between 1 and 99.']);
    }

    $seenItems[$id] = true;
    $product = $catalog[$id];
    $items[] = [
        'id' => $id,
        'name' => $product['name'],
        'price' => $product['price'],
        'quantity' => $quantity
    ];
    $total += $product['price'] * $quantity;
}

$order = [
    'id' => 'TH-' . gmdate('YmdHis') . '-' . strtoupper(bin2hex(random_bytes(3))),
    'date' => gmdate(DATE_ATOM),
    'customer' => $customer['firstName'] . ' ' . $customer['lastName'],
    'email' => $customer['email'],
    'phone' => $customer['phone'],
    'shippingAddress' => [
        'street' => $customer['address'],
        'city' => $customer['city'],
        'postalCode' => $customer['postalCode']
    ],
    'items' => $items,
    'total' => $total,
    'paymentMethod' => $paymentMethod === 'gcash' ? 'GCash' : 'Cash on delivery',
    'paymentStatus' => $paymentMethod === 'gcash' ? 'Paid (simulated)' : 'Payment due on delivery'
];

$storageDirectory = __DIR__ . DIRECTORY_SEPARATOR . 'data';
if (!is_dir($storageDirectory) && !mkdir($storageDirectory, 0750, true) && !is_dir($storageDirectory)) {
    respond(500, ['error' => 'Order storage directory could not be created.']);
}

$storagePath = $storageDirectory . DIRECTORY_SEPARATOR . 'orders.json';
$storageFile = @fopen($storagePath, 'c+');
if ($storageFile === false) {
    respond(500, ['error' => 'Order storage file could not be opened.']);
}
if (!flock($storageFile, LOCK_EX)) {
    fclose($storageFile);
    respond(500, ['error' => 'Order storage file could not be locked.']);
}

$contents = stream_get_contents($storageFile);
$orders = $contents === '' ? [] : json_decode($contents, true);
if (!is_array($orders) || !array_is_list($orders)
    || ($contents !== '' && json_last_error() !== JSON_ERROR_NONE)) {
    flock($storageFile, LOCK_UN);
    fclose($storageFile);
    respond(500, ['error' => 'Order storage file contains invalid JSON.']);
}

$orders[] = $order;
$json = json_encode($orders, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
rewind($storageFile);
$written = ftruncate($storageFile, 0);
$bytesWritten = 0;
while ($written && $bytesWritten < strlen($json)) {
    $chunkSize = fwrite($storageFile, substr($json, $bytesWritten));
    if ($chunkSize === false || $chunkSize === 0) {
        $written = false;
        break;
    }
    $bytesWritten += $chunkSize;
}
$written = $written && $bytesWritten === strlen($json) && fflush($storageFile);
flock($storageFile, LOCK_UN);
fclose($storageFile);

if (!$written) {
    respond(500, ['error' => 'Order could not be written to the JSON file.']);
}

respond(201, ['order' => $order]);
