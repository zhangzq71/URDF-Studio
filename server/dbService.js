import { PrismaClient } from '@prisma/client';

let prisma;

// Connection state tracking (Prisma manages pool, but we keep this for API compat)
let isConnected = false;

// Helper to serialize tags array to string
const serializeTags = (tags) => {
    if (!tags) return "[]";
    return JSON.stringify(tags);
};

// Helper to deserialize tags string to array
const deserializeTags = (tagsStr) => {
    if (!tagsStr) return [];
    try {
        return JSON.parse(tagsStr);
    } catch {
        return [];
    }
};

// Format asset for frontend
const formatAsset = (asset) => {
    if (!asset) return null;
    return {
        ...asset,
        tags: deserializeTags(asset.tags),
        tags_zh: deserializeTags(asset.tags_zh),
        lastUpdated: asset.lastUpdated.toISOString().split('T')[0] // Format date to YYYY-MM-DD
    };
};

/**
 * Connect to Database
 * For Prisma this is mostly a no-op as it connects lazily, but we can test connection.
 */
export async function connect() {
    try {
        if (!prisma) {
            prisma = new PrismaClient({
                log: ['info', 'warn', 'error'],
            });
        }
        await prisma.$connect();
        console.log('[DB Service] Connected to SQLite via Prisma successfully');
        isConnected = true;
    } catch (error) {
        console.error('[DB Service] Prisma connection error:', error);
        isConnected = false;
        throw error;
    }
}

/**
 * Get all assets from database
 * @returns {Promise<Array>} List of assets
 */
export async function getAllAssets() {
    try {
        const assets = await prisma.uRDFStudioAsset.findMany({
            orderBy: {
                stars: 'desc'
            }
        });
        return assets.map(formatAsset);
    } catch (error) {
        console.error('[DB Service] Error fetching assets:', error);
        throw error;
    }
}

/**
 * Get a single asset by its UUID
 * @param {string} id - The UUID
 * @returns {Promise<Object|null>} Asset object or null
 */
export async function getAssetById(id) {
    try {
        const asset = await prisma.uRDFStudioAsset.findUnique({
            where: { id }
        });
        return formatAsset(asset);
    } catch (error) {
        console.error(`[DB Service] Error fetching asset ${id}:`, error);
        throw error;
    }
}

/**
 * Create or update an asset
 * @param {Object} assetData 
 * @returns {Promise<Object>} The saved asset
 */
export async function upsertAsset(assetData) {
    try {
        const { id, tags, tags_zh, lastUpdated, ...otherFields } = assetData;
        
        // Prepare data for Prisma (serialize arrays)
        const data = {
            ...otherFields,
            id,
            tags: serializeTags(tags),
            tags_zh: serializeTags(tags_zh),
            lastUpdated: lastUpdated ? new Date(lastUpdated) : new Date()
        };

        const asset = await prisma.uRDFStudioAsset.upsert({
            where: { id },
            update: data,
            create: data
        });
        
        return formatAsset(asset);
    } catch (error) {
        console.error('[DB Service] Error upserting asset:', error);
        throw error;
    }
}

/**
 * Seed initial data if collection is empty
 * @param {Array} initialData - Array of asset objects
 */
export async function seedData(initialData) {
    try {
        const count = await prisma.uRDFStudioAsset.count();
        if (count === 0 && initialData && initialData.length > 0) {
            console.log(`[DB Service] Seeding database with ${initialData.length} assets...`);
            
            // Process data for batch insert
            // Note: createMany is not supported in SQLite for some versions, but recent Prisma supports it.
            // If it fails, we fall back to Promise.all
            
            for (const asset of initialData) {
                await upsertAsset(asset);
            }
            
            console.log('[DB Service] Seeding complete.');
        } else {
            console.log(`[DB Service] Database already contains ${count} assets. Skipping seed.`);
        }
    } catch (error) {
        console.error('[DB Service] Error seeding data:', error);
    }
}
