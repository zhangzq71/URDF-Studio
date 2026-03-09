import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import * as bosService from './bosService.js';
import * as dbService from './dbService.js';
// import { INITIAL_ASSETS } from './seedData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Load environment variables from specific path (root directory)
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const port = 3001;
const API_TOKEN = process.env.VITE_API_TOKEN;

// Initialize Services
const initializeServices = async () => {
    // BOS Service
    try {
        bosService.init({
            endpoint: process.env.BOS_ENDPOINT, 
            ak: process.env.BOS_AK,
            sk: process.env.BOS_SK,
            bucket: process.env.BOS_BUCKET
        });
    } catch (error) {
        console.error('[Backend] Failed to initialize BOS Service:', error.message);
    }
    
    // DB Service (SQLite via Prisma)
    try {
        await dbService.connect();
        // await dbService.seedData(INITIAL_ASSETS);
        // Note: With Prisma + SQLite, connection is file-based.
        // Data will be stored in prisma/dev.db by default.
    } catch (error) {
        console.error('[Backend] Failed to initialize DB Service:', error.message);
    }
};

initializeServices();

// Enable CORS for frontend
app.use(cors());

// Parse JSON bodies (limit increased for base64 image uploads)
app.use(bodyParser.json({ limit: '10mb' }));

// Auth Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (token == null) return res.sendStatus(401); // No token present

  if (token !== API_TOKEN) {
    console.log(`[Backend] Auth failed.`);
    return res.sendStatus(403); // Invalid token
  }

  next();
};

// Endpoint to handle asset download
app.post('/api/download-asset', authenticateToken, async (req, res) => {
  const { assetId } = req.body;

  if (!assetId) {
     return res.status(400).json({ success: false, message: 'assetId is required' });
  }

  try {
      const asset = await dbService.getAssetById(assetId);
      if (!asset || !asset.urdfPath) {
          return res.status(404).json({ success: false, message: 'Asset not found or missing URDF path' });
      }
      
      const urdfPath = asset.urdfPath;
      const files = await bosService.listFiles(urdfPath);
      
      // Extract root folder name from urdfPath for the frontend
      // e.g. "/library/urdf/unitree/go2_description" -> "go2_description"
      const rootFolderName = urdfPath.split('/').filter(Boolean).pop() || 'robot';

      res.json({  
          success: true, 
          message: 'Files listed successfully',
          data: {
              files: files,
              rootFolderName: rootFolderName,
              // Backend can also pass the main URDF file name if known, to help frontend
              urdfFile: asset.urdfFile
          }
      });
  } catch (error) {
      console.error('[Backend] Error generating download URL:', error);
      res.status(500).json({ success: false, message: 'Failed to generate download URL' });
  }
});

// Endpoint to upload thumbnail (path handling on authenticated backend)
app.post('/api/upload-thumbnail', authenticateToken, async (req, res) => {
    const { assetId, content, secret } = req.body;
  
    if (!assetId || !content) {
       return res.status(400).json({ success: false, message: 'assetId and content are required' });
    }
  
    // Security: Require Upload Secret
    if (secret !== process.env.UPLOAD_SECRET) {
        console.warn(`[Backend Security] Upload attempt with invalid secret`);
        return res.status(403).json({ success: false, message: 'Invalid upload secret' });
    }
  
    try {
        const asset = await dbService.getAssetById(assetId);
        if (!asset || !asset.urdfPath) {
            return res.status(404).json({ success: false, message: 'Asset not found' });
        }
        
        // Construct file path on backend
        const fileName = 'thumbnail.png';
        const urdfPath = asset.urdfPath;
        const targetPath = urdfPath.endsWith('/') 
            ? `${urdfPath}${fileName}` 
            : `${urdfPath}/${fileName}`;
            
        await bosService.uploadFile(targetPath, content);
  
        res.json({ 
            success: true, 
            message: 'Thumbnail uploaded successfully'
        });
    } catch (error) {
        console.error('[Backend] Error uploading thumbnail:', error);
        res.status(500).json({ success: false, message: 'Failed to upload thumbnail' });
    }
  });

// Endpoint to get a signed URL for a single file (e.g. thumbnail or video)
app.post('/api/get-signed-url', authenticateToken, async (req, res) => {
  const { assetId, fileType } = req.body;

  if (!assetId) {
     return res.status(400).json({ success: false, message: 'assetId is required' });
  }

  try {
      const asset = await dbService.getAssetById(assetId);
      if (!asset) {
          return res.status(404).json({ success: false, message: 'Asset not found' });
      }

      let filePath;
      if (fileType === 'thumbnail') {
          // If asset has explicit thumbnail path, use it, otherwise guess
          // Current logic in data.ts uses exact paths.
          // We can use the detailed path from DB.
          filePath = asset.thumbnail;
      } else if (fileType === 'previewVideo') {
          filePath = asset.previewVideo;
      } else {
          // Fallback or specific file request if we want to support it
           return res.status(400).json({ success: false, message: 'Invalid or missing fileType' });
      }

      if (!filePath) {
          return res.status(404).json({ success: false, message: 'File path not found for this asset' });
      }

      const downloadUrl = await bosService.getSignedUrl(filePath);

      res.json({ 
          success: true, 
          message: 'URL generated successfully',
          data: {
              url: downloadUrl
          }
      });
  } catch (error) {
      console.error('[Backend] Error generating signed URL:', error);
      res.status(500).json({ success: false, message: 'Failed to generate signed URL' });
  }
});

// Endpoint to avoid CORS problems)
app.post('/api/upload-file', authenticateToken, async (req, res) => {
  const { assetId, relativePath, content, secret } = req.body;

  if (!assetId || !relativePath || !content) {
     return res.status(400).json({ success: false, message: 'assetId, relativePath and content are required' });
  }

  // Security: Require Upload Secret
  if (secret !== process.env.UPLOAD_SECRET) {
      console.warn(`[Backend Security] Upload attempt with invalid secret`);
      return res.status(403).json({ success: false, message: 'Invalid upload secret' });
  }

  try {
      const asset = await dbService.getAssetById(assetId);
      if (!asset || !asset.urdfPath) {
          return res.status(404).json({ success: false, message: 'Asset not found or missing URDF path' });
      }

      // Construct file path on backend, joining urdfPath with relativePath
      // Normalize slashes
      const urdfPath = asset.urdfPath.endsWith('/') ? asset.urdfPath : `${asset.urdfPath}/`;
      const cleanRelativePath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
      const targetPath = urdfPath + cleanRelativePath;

      await bosService.uploadFile(targetPath, content);

      res.json({ 
          success: true, 
          message: 'File uploaded successfully'
      });
  } catch (error) {
      console.error('[Backend] Error uploading file:', error);
      res.status(500).json({ success: false, message: 'Failed to upload file' });
  }
});

// Endpoint to get all assets
app.get('/api/assets', authenticateToken, async (req, res) => {
    try {
        const assets = await dbService.getAllAssets();
        res.json({
            success: true,
            data: { assets }
        });
    } catch (error) {
        console.error('[Backend] Error fetching assets:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch assets' });
    }
});


app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
