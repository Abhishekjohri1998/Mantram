import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import config from "../config/env.js";
import crypto from "crypto";

const s3Client = new S3Client({
    region: config.aws.region,
    credentials: {
        accessKeyId: config.aws.accessKeyId,
        secretAccessKey: config.aws.secretAccessKey,
    },
});

/**
 * Uploads a buffer or base64 string to S3
 * @param {Buffer|string} fileContent - The file content to upload
 * @param {string} fileName - Optional filename, will generate if missing
 * @param {string} mimeType - The content type (e.g., image/png)
 * @returns {Promise<string>} - The public URL of the uploaded file
 */
export const uploadToS3 = async (fileContent, fileName, mimeType = "image/png") => {
    try {
        let buffer = fileContent;
        if (typeof fileContent === "string" && fileContent.startsWith("data:")) {
            // Extract base64 data
            const base64Data = fileContent.split(",")[1];
            buffer = Buffer.from(base64Data, "base64");
        } else if (typeof fileContent === "string") {
            buffer = Buffer.from(fileContent, "base64");
        }

        const key = fileName || `uploads/${crypto.randomUUID()}.png`;

        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: config.aws.bucket,
                Key: key,
                Body: buffer,
                ContentType: mimeType,
                // ACL: "public-read", // Removed as bucket might have Object Ownership set to BucketOwnerEnforced
            },
        });

        await upload.done();

        // Construct the public URL
        // Format: https://bucket-name.s3.region.amazonaws.com/key
        return `https://${config.aws.bucket}.s3.${config.aws.region}.amazonaws.com/${key}`;
    } catch (error) {
        console.error("S3 Upload Error:", error);
        throw new Error(`S3 Upload failed: ${error.message}`);
    }
};

export default { uploadToS3 };
