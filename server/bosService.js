import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { BosClient, Auth } = require('@baiducloud/sdk');

// --- WORKAROUND START ---
// Workaround for "RangeError: Invalid time value" in @baiducloud/sdk
// Patch Auth.prototype directly to fix all instances
if (Auth && Auth.prototype) {
    console.log('[Backend] Applying global patch to Auth.prototype.getTimestamp');
    Auth.prototype.getTimestamp = function(timestamp) {
        let dateObj = timestamp;
        
        dateObj = new Date();
        // Final safety check
        if (isNaN(dateObj.getTime())) {
            console.warn('[Backend Warning] Invalid date detected in SDK Auth, using current time fallback');
            dateObj = new Date();
        }

        // BOS requires ISO 8601 format: yyyy-mm-ddThh:mm:ssZ (no milliseconds)
        const iso = dateObj.toISOString().replace(/\.\d{3}/g, '');
        return iso;
    };
}
// --- WORKAROUND END ---

let client = null;
let bucketName = null;

/**
 * Initialize the BOS client with configuration
 * @param {Object} config
 * @param {string} config.endpoint
 * @param {string} config.ak
 * @param {string} config.sk
 * @param {string} config.bucket
 */
export function init(config) {
    if (!config.endpoint || !config.ak || !config.sk || !config.bucket) {
        console.error('[BOS Service] Missing configuration');
        throw new Error('BOS configuration missing. Check environment variables.');
    }
    
    bucketName = config.bucket;
    
    const bosConfig = {
        endpoint: config.endpoint,
        credentials: {
            ak: config.ak,
            sk: config.sk
        }
    };
    client = new BosClient(bosConfig);
    console.log('[BOS Service] Client initialized successfully for bucket:', bucketName);
}

/**
 * List files under a prefix and return download URLs
 * @param {string} urdfPath - The directory path in BOS
 * @returns {Promise<Array>} List of files with relative paths and signed URLs
 */
export async function listFiles(urdfPath) {
    if (!client) throw new Error('BOS client not initialized');

    // Normalize urdfPath to remove leading slash
    const prefix = urdfPath.startsWith('/') ? urdfPath.slice(1) : urdfPath;
    
    // Ensure prefix ends with / to list all files in directory
    const dirPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;

    console.log(`[BOS Service] Listing objects for prefix: ${dirPrefix}`);

    const response = await client.listObjects(bucketName, { prefix: dirPrefix });
    
    if (!response.body || !response.body.contents) {
        return [];
    }

    // Map to relative paths and generate presigned URLs
    const files = response.body.contents
        .map(item => {
            // Remove prefix to get relative path
            const relativePath = item.key.slice(dirPrefix.length);
            
            // Skip directory markers or empty names
            if (!relativePath) return null;

            // Use 1800s (30min) expiration
            const downloadUrl = client.generatePresignedUrl(bucketName, item.key, {
                expirationInSeconds: 1800
            });

            return {
                path: relativePath,
                url: downloadUrl
            };
        })
        .filter(item => item !== null);

    console.log(`[BOS Service] Found ${files.length} files`);
    return files;
}

/**
 * Generate a signed URL for a single file
 * @param {string} filePath - Path to the file in BOS
 * @returns {Promise<string>} Signed URL
 */
export async function getSignedUrl(filePath) {
    if (!client) throw new Error('BOS client not initialized');

    // Normalize filePath to remove leading slash
    const key = filePath.startsWith('/') ? filePath.slice(1) : filePath;

    // Use 1800s (30min) expiration
    return client.generatePresignedUrl(bucketName, key, {
        expirationInSeconds: 1800
    });
}

/**
 * Upload a file (image) to BOS
 * @param {string} filePath - Destination path in BOS
 * @param {string} content - Base64 encoded content
 */
export async function uploadFile(filePath, content) {
    if (!client) throw new Error('BOS client not initialized');

    // Normalize filePath to remove leading slash
    const key = filePath.startsWith('/') ? filePath.slice(1) : filePath;

    console.log(`[BOS Service] Uploading file to BOS: ${key}`);

    // Extract raw base64 data
    const base64Data = content.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    await client.putObject(bucketName, key, buffer, {
        'Content-Type': 'image/png'
    });
}
