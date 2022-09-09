import crypto from 'crypto';
import fsa from 'fs/promises';
import fss from 'fs';
import os from 'os';
import path from 'path';
import {
    DeleteObjectCommand,
    DeleteObjectCommandInput,
    DeleteObjectCommandOutput,
    DeleteObjectsCommand,
    DeleteObjectsCommandInput,
    DeleteObjectsCommandOutput,
    GetObjectCommand,
    GetObjectCommandInput,
    GetObjectCommandOutput, HeadObjectCommand, HeadObjectCommandInput,
    HeadObjectCommandOutput, ListObjectsV2Command, ListObjectsV2CommandInput,
    ListObjectsV2CommandOutput, PutObjectCommand, PutObjectCommandInput,
    PutObjectCommandOutput,
    S3
} from '@aws-sdk/client-s3';
import {IAwsSimpleStorageServiceNormalizedPath} from '../interface/IAwsSimpleStorageServiceNormalizedPath';
import {JsonSerializer} from 'syncstream-serializer-json';
import {Readable} from 'stream';
import {IAwsSimpleStorageServiceConfiguration} from "../interface/IAwsSimpleStorageServiceConfiguration";
import {AwsSimpleStorageServiceEnvironmentConfiguration} from "../model/AwsSimpleStorageServiceEnvironmentConfiguration";

/**
 * This constant defines the prefix for hidden items in S3
 * @constant
 * @type {string}
 */
export const AwsSimpleStorageServiceHiddenPrefix: string = '_.';

/**
 * This class maintains the service provider structure for Amazon S3
 * @class
 */
export class AwsSimpleStorageService {

    /**
     * This property contains the client configuration object
     * @property
     * @protected
     * @static
     * @type {IAwsSimpleStorageServiceConfiguration}
     */
    protected static configuration: IAwsSimpleStorageServiceConfiguration;

    /**
     * This property determines whether the client has been configured or not
     * @property
     * @protected
     * @static
     * @type {boolean}
     */
    protected static configured: boolean = false;

    /**
     * This property contains the instance of our AWS S3 service provider
     * @property
     * @protected
     * @static
     * @type {S3}
     */
    protected static client: S3;

    /**
     * This method converts an S3 object Blob into a Buffer
     * @async
     * @param {Blob} stream
     * @public
     * @returns {Promise<Buffer>}
     * @static
     */
    public static async blobToBuffer(stream: Blob): Promise<Buffer> {

        // We're done, return the buffer from the stream
        return Buffer.from(await stream.arrayBuffer());
    }

    /**
     * This method configures the library
     * @param {IAwsSimpleStorageServiceConfiguration} configuration
     * @public
     * @returns {void}
     * @static
     */
    public static configure(configuration: IAwsSimpleStorageServiceConfiguration = new AwsSimpleStorageServiceEnvironmentConfiguration()): void {

        // Set the configuration into the library
        AwsSimpleStorageService.configuration = configuration;

        // Configure the client
        AwsSimpleStorageService.client = new S3({

            // Set the custom user-agent into the configuration
            customUserAgent: AwsSimpleStorageService.configuration.userAgent,

            // Set the region into the configuration
            region: AwsSimpleStorageService.configuration.region
        });

        // Reset the configured flag into the instance
        AwsSimpleStorageService.configured = true;
    }

    /**
     * This method asynchronously copies one directory object to another with the option to delete the original
     * @param {string} sourceDirectoryPath
     * @param {string} destinationDirectoryPath
     * @param {boolean?} deleteOriginal
     * @public
     * @returns {Promise<PutObjectCommandOutput[]>}
     * @static
     */
    public static async copyDirectoryAsync(sourceDirectoryPath: string, destinationDirectoryPath: string, deleteOriginal?: boolean): Promise<PutObjectCommandOutput[]> {

        // Normalize the source directory path
        const normalizedSourceDirectoryPath: IAwsSimpleStorageServiceNormalizedPath =
            AwsSimpleStorageService.normalizePath(sourceDirectoryPath, true);

        // Normalize the destination directory
        const normalizedDestinationDirectoryPath: IAwsSimpleStorageServiceNormalizedPath =
            AwsSimpleStorageService.normalizePath(destinationDirectoryPath, true);

        // Define our response
        let response: PutObjectCommandOutput[] = [];

        if (!await AwsSimpleStorageService.directoryExistsAsync(normalizedSourceDirectoryPath.path))
            throw new Error('Object Directory Not Found');

        // List the directory
        const directory: ListObjectsV2CommandOutput =
            await AwsSimpleStorageService.listObjectsAsync(normalizedSourceDirectoryPath.path);

        // Iterate over the directory contents
        for (const object of (directory?.Contents ?? [])) if (!!object.Key)
            response.push(await AwsSimpleStorageService.copyObjectAsync(object.Key, object.Key
                .replace(normalizedSourceDirectoryPath.path, normalizedDestinationDirectoryPath.path), deleteOriginal));

        // Iterate over the common prefixes
        for (const subDirectory of (directory?.CommonPrefixes ?? [])) if (!!subDirectory.Prefix) response =
            response.concat(await AwsSimpleStorageService.copyDirectoryAsync(subDirectory.Prefix, subDirectory.Prefix
                .replace(normalizedSourceDirectoryPath.path, normalizedDestinationDirectoryPath.path), deleteOriginal));

        // Check the delete-original flag and if the directory exists
        if ((deleteOriginal === true) && await AwsSimpleStorageService.directoryExistsAsync(normalizedSourceDirectoryPath.path))
            await AwsSimpleStorageService.deleteDirectoryAsync(normalizedSourceDirectoryPath.path);

        // We're done, send the response
        return response;
    }

    /**
     * This method asynchronously copies objects across to each other in S3
     * @async
     * @param {string} sourceObjectPath
     * @param {string} destinationObjectPath
     * @param {boolean?} deleteOriginal
     * @returns {Promise<PutObjectCommandOutput>}
     * @static
     */
    public static async copyObjectAsync(sourceObjectPath: string, destinationObjectPath: string, deleteOriginal?: boolean): Promise<PutObjectCommandOutput> {

            // Normalize the destination object path
            const normalizedDestinationObjectPath: IAwsSimpleStorageServiceNormalizedPath =
                AwsSimpleStorageService.normalizePath(destinationObjectPath);

            // Normalize the source object path
            const normalizedSourceObjectPath: IAwsSimpleStorageServiceNormalizedPath =
                AwsSimpleStorageService.normalizePath(sourceObjectPath);

            // Define our file path name
            const tempFilePath: string = path.resolve(path.join(os.tmpdir(), crypto.randomUUID()));

            // Try to write the file
            try {

                // Stream the object from S3
                const currentObject: GetObjectCommandOutput =
                    await AwsSimpleStorageService.getObjectAsync(normalizedSourceObjectPath.path);


                // Save the object to its new location
                const newObject: PutObjectCommandOutput =
                    await AwsSimpleStorageService.putObjectAsync(normalizedDestinationObjectPath.path, currentObject.Body);

                // Check the delete-original flag
                if (deleteOriginal === true)
                    await AwsSimpleStorageService.deleteObjectAsync(normalizedDestinationObjectPath.path);

                // We're done, send the response
                return newObject;

            } finally {

                // Check to see if the file still exists in the file system and remove it
                if (fss.existsSync(tempFilePath)) await fsa.unlink(tempFilePath);
            }
    }

    /**
     * THis method deletes a directory in S3
     * @async
     * @param {string} directoryPath
     * @returns {Promise<(DeleteObjectCommandOutput | null)>}
     * @static
     */
    public static async deleteDirectoryAsync(directoryPath: string): Promise<(DeleteObjectCommandOutput | null)> {

        // Ensure the client is configured
        if (!AwsSimpleStorageService.configured) AwsSimpleStorageService.configure();

        // Normalize the path
        const normalizedObjectPath: IAwsSimpleStorageServiceNormalizedPath =
            AwsSimpleStorageService.normalizePath(directoryPath, true);

        // Ensure we're working with a directory
        if (!normalizedObjectPath.directory) throw new Error('Path Not A Directory');

        // List the objects in the directory
        const data: ListObjectsV2CommandOutput = await AwsSimpleStorageService.listObjectsAsync(normalizedObjectPath.path);

        // Check for objects in the directory
        if (!data.Contents?.length) return null;

        // Iterate over the subdirectories and delete them
        for (const prefix of (data.CommonPrefixes ?? [])) if (!!prefix.Prefix)
            await AwsSimpleStorageService.deleteDirectoryAsync(prefix.Prefix);

        // Define our list of keys to delete
        const keysToDelete: string[] = (data.Contents.filter(o => !!o.Key).map(o => o.Key) as string[]);

        // We're done, delete the objects and return the results
        await AwsSimpleStorageService.deleteObjectsAsync(keysToDelete);

        // We're done, delete the object
        return this.client.send<DeleteObjectCommandInput, DeleteObjectCommandOutput>(new DeleteObjectCommand({

            // Set the bucket into the command's input
            Bucket: AwsSimpleStorageService.configuration.bucket,

            // Set the object key into the command's input
            Key: normalizedObjectPath.path
        }));
    }

    /**
     * This method deletes an object or file from S3
     * @async
     * @param {string} objectPath
     * @returns {Promise<(DeleteObjectCommandOutput | DeleteObjectsCommandOutput | null)>}
     * @static
     */
    public static deleteObjectAsync(objectPath: (string | string[])): Promise<(DeleteObjectCommandOutput | DeleteObjectsCommandOutput | null)> {

        // Check for multiple keys
        if (Array.isArray(objectPath)) return this.deleteObjectsAsync(objectPath);

        // Ensure the client is configured
        if (!AwsSimpleStorageService.configured) AwsSimpleStorageService.configure();

        // Normalize the path
        const normalizedObjectPath: IAwsSimpleStorageServiceNormalizedPath = AwsSimpleStorageService.normalizePath(objectPath);

        // Check for a directory and delete it
        if (normalizedObjectPath.directory) return AwsSimpleStorageService.deleteDirectoryAsync(normalizedObjectPath.path);

        // We're done, delete the object
        return this.client.send<DeleteObjectCommandInput, DeleteObjectsCommandOutput>(new DeleteObjectCommand({

                // Set the bucket into the command's input
                Bucket: AwsSimpleStorageService.configuration.bucket,

                // Set the object key into the command's input
                Key: normalizedObjectPath.path,
            }));
    }

    /**
     * This method deletes objects from S3
     * @async
     * @param {(string|string[])} keys
     * @returns {Promise<(DeleteObjectsCommandOutput | null)>}
     * @static
     */
    public static deleteObjectsAsync(keys: (string | string[])): Promise<(DeleteObjectsCommandOutput | null)> {

        // Ensure the client is configured
        if (!AwsSimpleStorageService.configured) AwsSimpleStorageService.configure();

        // Check for keys and return
        if (!keys?.length) return Promise.resolve(null);

        // Check for a file and delete it
        if (typeof keys === 'string') return AwsSimpleStorageService.deleteObjectAsync(keys);

        // We're done, delete and return
        return this.client.send<DeleteObjectsCommandInput, DeleteObjectsCommandOutput>(new DeleteObjectsCommand({

            // Set the bucket into the command's input
            Bucket: AwsSimpleStorageService.configuration.bucket,

            // Define our batch deletion into the command's input
            Delete: {

                // Set the object keys to delete into the batch deletion
                Objects: keys.map((k: string): any => ({
                    Key: AwsSimpleStorageService.normalizePath(k).path
                }))
            }
        }));
    }

    /**
     * This method asynchronously determines whether a directory exists or not
     * @async
     * @param {string} objectPath
     * @public
     * @returns {Promise<boolean>}
     * @static
     */
    public static async directoryExistsAsync(objectPath: string): Promise<boolean> {

        // Normalize our path
        objectPath = AwsSimpleStorageService.normalizePath(objectPath, true).path;

        // Ensure the object path has a trailing slash
        if (!objectPath.endsWith('/')) objectPath += '/';

        // Check to see if the object exists
        if (await AwsSimpleStorageService.objectExistsAsync(objectPath)) return true;

        // Try to list the directory contents
        try {

            // List the objects in the directory
            const directoryContents: ListObjectsV2CommandOutput =
                await AwsSimpleStorageService.listObjectsAsync(objectPath);

            // We're done, return the test
            return (((directoryContents.Contents?.length ?? 0) > 0)
                || ((directoryContents.CommonPrefixes?.length ?? 0) > 0));

        } catch (error: any) {

            // Check the error code on the error and return
            if (error?.name === 'NotFound') return false;

            // We're done, throw the exception
            throw error;
        }
    }

    /**
     * This method converts an object name to hidden notation
     * @param {string} objectName
     * @public
     * @returns {string}
     * @static
     */
    public static generateHiddenName(objectName: string): string {

        // Check the object's name for hidden notation
        if (objectName.startsWith(AwsSimpleStorageServiceHiddenPrefix))
            return (AwsSimpleStorageServiceHiddenPrefix + objectName);

        // Otherwise, just return the object's name
        return objectName;
    }

    /**
     * THis method loads an object or file from S3
     * @async
     * @param {string} objectPath
     * @param {number?} start
     * @param {number?} end
     * @returns {Promise<GetObjectCommandOutput>}
     * @static
     */
    public static getObjectAsync(objectPath: string, start?: number, end?: number): Promise<GetObjectCommandOutput> {

        // Ensure the client is configured
        if (!AwsSimpleStorageService.configured) AwsSimpleStorageService.configure();

        // Normalize the path
        const normalizedObjectPath: IAwsSimpleStorageServiceNormalizedPath =
            AwsSimpleStorageService.normalizePath(objectPath);

        // Define our range
        let range: (string | undefined) = undefined;

        // Check for a start and an end then generate the range
        if (!!start && !!end) range = `range=${start}-${end}`;

        // Check for a start then generate the range
        else if (!!start) range = `range=${start}`;

        // Check for an end then generate the range
        else if (!!end) range = `range=0-${end}`;

        // Return the object from S3
        return this.client.send<GetObjectCommandInput, GetObjectCommandOutput>(new GetObjectCommand({

            // Set the bucket into the command's input
            Bucket: AwsSimpleStorageService.configuration.bucket,

            // Set the object key into the command's input
            Key: normalizedObjectPath.path,

            // Set the range into the command's input
            Range: range
        }));
    }

    /**
     * This method asynchronously downloads an object and deserializes it
     * @param {string} objectPath
     * @returns {Promise<TOutput>}
     * @static
     * @typedef TOutput
     */
    public static async getObjectJsonAsync<TOutput extends {}>(objectPath: string): Promise<TOutput> {

        // Download the object
        const object: GetObjectCommandOutput = await AwsSimpleStorageService.getObjectAsync(objectPath);

        // Check for a body
        if (!object.Body) throw new Error('Invalid Object');

        // We're done, deserialize the JSON and return the output
        return JsonSerializer.deserialize<TOutput>(await AwsSimpleStorageService.streamToString(object.Body));
    }

    /**
     * This method gets the object's name from a path
     * @param {string} objectPath
     * @public
     * @returns {string}
     * @static
     */
    public static getObjectName(objectPath: string): string {

        // Split the path into parts
        const objectNameParts: string[] = path.normalize(objectPath.trim())
            .replace(/\/|\\+/g, '/').split('/');

        // Define the object name
        let objectName: string = objectNameParts[objectNameParts.length - 1];

        // Ensure we have an object name
        if (!objectName) objectName = (objectNameParts[objectNameParts.length - 2] + '/');

        // We're done, return the object name
        return objectName;
    }

    /**
     * This method generates and trims the object name
     * @param {string} objectPath
     * @public
     * @returns {string}
     * @static
     */
    public static getTrimmedObjectName(objectPath: string): string {

        // We're done, return the object name
        return AwsSimpleStorageService.trimObjectPath(AwsSimpleStorageService.getObjectName(objectPath));
    }

    /**
     * This method loads an object's meta-data
     * @async
     * @param {string} objectPath
     * @returns {Promise<HeadObjectCommandOutput>}
     * @static
     */
    public static headObjectAsync(objectPath: string): Promise<HeadObjectCommandOutput> {

        // Ensure the client is configured
        if (!AwsSimpleStorageService.configured) AwsSimpleStorageService.configure();

        // Normalize the path
        const normalizedObjectPath: IAwsSimpleStorageServiceNormalizedPath = AwsSimpleStorageService.normalizePath(objectPath);

        // We're done, grab the object's meta-data from S3 and send the response
        return this.client.send<HeadObjectCommandInput, HeadObjectCommandOutput>(new HeadObjectCommand({

            // Set the bucket into the command's input
            Bucket: AwsSimpleStorageService.configuration.bucket,

            // Set the object key into the command's input
            Key: normalizedObjectPath.path
        }));
    }

    /**
     * This method determines whether an object is hidden or not
     * @param {string} objectPath
     * @public
     * @returns {boolean}
     * @static
     */
    public static isHidden(objectPath: string): boolean {

        // We're done, check the file
        return AwsSimpleStorageService.getTrimmedObjectName(objectPath).startsWith(AwsSimpleStorageServiceHiddenPrefix);
    }

    /**
     * This method lists the objects in the bucket, inside the optional directory
     * @async
     * @param {string?} directoryPath
     * @param {string?} continuationToken
     * @returns {Promise<ListObjectsV2CommandOutput>}
     * @static
     */
    public static async listObjectsAsync(directoryPath?: string, continuationToken?: string): Promise<ListObjectsV2CommandOutput> {

        // Ensure the client is configured
        if (!AwsSimpleStorageService.configured) AwsSimpleStorageService.configure();

        // Normalize the path
        const normalizedObjectPath: IAwsSimpleStorageServiceNormalizedPath =
            AwsSimpleStorageService.normalizePath((directoryPath ?? '/'), true);

        // List the objects in the directory
        const request: ListObjectsV2CommandOutput =
            await this.client.send<ListObjectsV2CommandInput, ListObjectsV2CommandOutput>(new ListObjectsV2Command({

                // Set the bucket into the command's input
                Bucket: AwsSimpleStorageService.configuration.bucket,

                // Set the continuation token into the command's input
                ContinuationToken: continuationToken,

                // Set the delimiter into the command's input
                Delimiter: (normalizedObjectPath.path ? '/' : undefined),

                // Set the prefix into the command's input
                Prefix: normalizedObjectPath.path
            }));

        // Check for a truncated request and complete it
        if (request.IsTruncated === true) {

            // List the rest of the objects
            const secondRequest: ListObjectsV2CommandOutput =
                await AwsSimpleStorageService.listObjectsAsync(directoryPath, request.ContinuationToken);

            // Combine the results
            request.Contents = (request.Contents ?? []).concat(secondRequest.Contents ?? []);
        }

        // We're done, send the response
        return request;
    }

    /**
     * This method creates a directory in S3
     * @async
     * @param {string} directoryPath
     * @returns {Promise<(PutObjectCommandOutput | null)>}
     * @static
     */
    public static async makeDirectoryAsync(directoryPath: string): Promise<(PutObjectCommandOutput | null)> {

        // Ensure the client is configured
        if (!AwsSimpleStorageService.configured) AwsSimpleStorageService.configure();

        // Check to see if the directory exists
        if (await AwsSimpleStorageService.directoryExistsAsync(directoryPath)) return null;

        // Normalize the object path
        const normalizedObjectPath: IAwsSimpleStorageServiceNormalizedPath =
            AwsSimpleStorageService.normalizePath(directoryPath, true);

        // Define our response
        const input: PutObjectCommandInput = {

            // Set the ACL into the command's input
            ACL: 'private',

            // Set the bucket into the command's input
            Bucket: AwsSimpleStorageService.configuration.bucket,

            // Set the key into the command's input
            Key: normalizedObjectPath.path,
        };

        // Check for a KMS key ID
        if (!!AwsSimpleStorageService.configuration.keyManagementServiceKeyId) {

            // Set the server-side encryption into the command's input
            input.ServerSideEncryption = 'aws:kms';

            // Set the AWS KMS key ID into the command's input
            input.SSEKMSKeyId = AwsSimpleStorageService.configuration.keyManagementServiceKeyId;
        }

        // We're done, create the object in S3
        return this.client.send<PutObjectCommandInput, PutObjectCommandOutput>(new PutObjectCommand(input));
    }

    /**
     * This method asynchronously moves a directory in S3
     * @param {string} sourceDirectoryPath
     * @param {string} destinationDirectoryPath
     * @public
     * @returns {Promise<PutObjectCommandOutput[]>}
     * @static
     */
    public static moveDirectoryAsync(sourceDirectoryPath: string, destinationDirectoryPath: string): Promise<PutObjectCommandOutput[]> {

        // We're done, copy the objects then delete them
        return AwsSimpleStorageService.copyDirectoryAsync(sourceDirectoryPath, destinationDirectoryPath, true);
    }

    /**
     * This method asynchronously moves an object in S3
     * @async
     * @param {string} sourceObjectPath
     * @param {string} destinationObjectPath
     * @public
     * @returns {Promise<void>}
     * @static
     */
    public static async moveObjectAsync(sourceObjectPath: string, destinationObjectPath: string): Promise<void> {

        // Copy the object in S3 and delete the original
        await AwsSimpleStorageService.copyObjectAsync(sourceObjectPath, destinationObjectPath, true);
    }

    /**
     * This method normalizes a path for S3
     * @param {string} objectPath
     * @param {boolean?} directory
     * @returns {IAwsSimpleStorageServiceNormalizedPath}
     * @static
     * @static
     */
    public static normalizePath(objectPath: string, directory?: boolean): IAwsSimpleStorageServiceNormalizedPath {

        // Define our response
        const response: IAwsSimpleStorageServiceNormalizedPath = {

            // Default the directory flag in the response
            directory: (directory ?? false),

            // Default the path in the response
            path: objectPath.replace(/\/|\\+/g, '/')
        };

        // Check the last character of the path
        if (((directory === true) || response.path.endsWith('/') || objectPath.endsWith('/')) && !response.directory) {

            // Reset the directory flag into the response
            response.directory = true;
        }

        // Normalize the path
        response.path = path.normalize(response.path.trim()).replace(/\/|\\+/g, '/');

        // Check to see if the first character is a slash
        if (response.path.startsWith('/')) response.path = response.path.slice(1);

        // Check for a directory or trailing slash and normalize the path, forcing a directory
        if (((directory === true) || response.directory || objectPath.endsWith('/'))
            && !response.path.endsWith('/')) response.path = path.normalize(response.path + '/')
            .replace(/\/|\\+/g, '/');

        // We're done, return the normalized path
        return response;
    }

    /**
     * This method determines whether an object exists in S3 or not
     * @async
     * @param {string} objectPath
     * @returns {Promise<boolean>}
     */
    public static async objectExistsAsync(objectPath: string): Promise<boolean> {

        // Normalize the path
        const normalizedObjectPath: IAwsSimpleStorageServiceNormalizedPath = AwsSimpleStorageService.normalizePath(objectPath);

        // Try to load the meta-data for the object
        try {

            // Make the call for the object's meta-data
            await AwsSimpleStorageService.headObjectAsync(normalizedObjectPath.path);

            // We're done, send the response
            return true;

        } catch (error: any) {

            // Check the error code on the error and return
            if (error?.name === 'NotFound') return false;

            // We're done, throw the error
            throw error;
        }
    }

    /**
     * This method saves an object into S3
     * @async
     * @param {string} objectPath
     * @param {(string | Blob | Buffer | Uint8Array| Readable | ReadableStream<any> | undefined)} content
     * @returns {Promise<PutObjectCommandOutput>}
     */
    public static putObjectAsync(objectPath: string, content?: (string | Blob | Buffer | Uint8Array| Readable | ReadableStream<any> | undefined)):Promise<PutObjectCommandOutput> {

        // Ensure the client is configured
        if (!AwsSimpleStorageService.configured) AwsSimpleStorageService.configure();

        // Normalize the object path
        const normalizedObjectPath: IAwsSimpleStorageServiceNormalizedPath =
            AwsSimpleStorageService.normalizePath(objectPath);

        // Define our command's input
        const input: PutObjectCommandInput = {

            // Set the ACL into the command's input
            ACL: 'private',

            // Set the content into the command's input
            Body: (content ?? (new Date).toISOString()),

            // Set the bucket into the command's input
            Bucket: AwsSimpleStorageService.configuration.bucket,

            // Set the key into the command's input
            Key: normalizedObjectPath.path,
        };

        // Check for a KMS key ID
        if (!!AwsSimpleStorageService.configuration.keyManagementServiceKeyId) {

            // Set the server-side encryption into the command's input
            input.ServerSideEncryption = 'aws:kms';

            // Set the AWS KMS key ID into the command's input
            input.SSEKMSKeyId = AwsSimpleStorageService.configuration.keyManagementServiceKeyId;
        }

        // We're done, create the object in S3
        return this.client.send<PutObjectCommandInput, PutObjectCommandOutput>(new PutObjectCommand(input));
    }

    /**
     * This method serializes an object into JSON then asynchronously uploads it
     * @param {string} objectPath
     * @param {TInput} content
     * @param {boolean} pretty
     * @typedef TInput
     * @returns {Promise<PutObjectCommandOutput>}
     */
    public static putObjectJsonAsync<TInput extends {}>(objectPath: string, content: TInput, pretty: boolean = false): Promise<PutObjectCommandOutput> {

        // We're done, upload the object
        return AwsSimpleStorageService.putObjectAsync(objectPath, JsonSerializer.serialize(content, pretty));
    }

    /**
     * This method converts an S3 object Readable to a buffer
     * @async
     * @param {Readable} stream
     * @public
     * @returns {Promise<Buffer>}
     * @static
     */
    public static readableToBuffer(stream: Readable): Promise<Buffer> {

        // We're done, return our promise
        return new Promise<Buffer>((resolve, reject): void => {

            // Define our chunks
            const chunks: any[] = [];

            // Bind to the stream's data event
            stream.on('data', (chunk: any): number => chunks.push(chunk));

            // Bind to the stream's end event
            stream.on('end', (): void => resolve(Buffer.concat(chunks)));

            // Bind to the stream's error event
            stream.on('error', reject);
        });
    }

    /**
     * This method converts an S3 object ReadableStream<any> to a buffer
     * @async
     * @param {ReadableStream<any>} stream
     * @public
     * @returns {Promise<Buffer>}
     * @static
     */
    public static async readableStreamToBuffer(stream: ReadableStream<any>): Promise<Buffer> {

        // Localize our reader
        const reader: ReadableStreamDefaultReader<any> = stream.getReader();

        // Define our chunks
        const chunks: any[] = [];

        // Try to read the stream
        try {

            // Iterate indefinitely
            while (true) {

                // Read the chunk
                const {done, value} = await reader.read();

                // Check the done flag
                if (done) return Buffer.concat(chunks);

                // Add the chunk
                chunks.push(value);
            }

        } finally {

            // Release the lock on the file
            reader.releaseLock();
        }
    }

    /**
     * This method returns the AWS S3 Client service provider
     * @public
     * @returns {S3}
     * @static
     */
    public static service(): S3 {

        // We're done, return the service instance
        return this.client;
    }

    /**
     * This method converts an S3 object stream to a buffer
     * @async
     * @param {(Blob | Readable | ReadableStream<any>)} stream
     * @public
     * @returns {Promise<Buffer>}
     * @static
     */
    public static streamToBuffer(stream: (Blob | Readable | ReadableStream<any>)): Promise<Buffer> {

            // Check for a blob
            if ('stream' in stream) return AwsSimpleStorageService.blobToBuffer(stream);

            // Check for a readable stream and localize the reader
            else if ('getReader' in stream) return AwsSimpleStorageService.readableStreamToBuffer(stream);

            // Otherwise, assume it's a Readable
            else return AwsSimpleStorageService.readableToBuffer(stream as Readable);
    }

    /**
     * This method converts an S3 object stream to a string
     * @param {(Blob | Readable | ReadableStream<any>)} stream
     * @public
     * @returns {Promise<string>}
     * @static
     */
    public static async streamToString(stream: (Blob | Readable | ReadableStream<any>)): Promise<string> {

        // Convert the stream to a buffer
        const buffer: Buffer = await AwsSimpleStorageService.streamToBuffer(stream);

        // We're done, return the string
        return buffer.toString('utf-8');
    }

    /**
     * This method generates a temporary file name for the local filesystem
     * @param {string?} objectKey
     * @public
     * @returns {string}
     * @static
     */
    public static temporaryLocalName(objectKey?: string): string {

        // We're done, return our temporary name
        return path.resolve(path.join(os.tmpdir(), (objectKey ?? crypto.randomUUID())));
    }

    /**
     * This method trims slashes from an object path
     * @param {string} objectPath
     * @public
     * @returns {string}
     * @static
     */
    public static trimObjectPath(objectPath: string): string {

        // Trim the object path
        objectPath = path.normalize(objectPath.trim()).replace(/\/|\\+/g, '/');

        // Check for the root directory
        if (objectPath === '/') return objectPath;

        // Check for a beginning slash
        if (objectPath.startsWith('/')) objectPath = objectPath.slice(1);

        // Check for an ending slash
        if (objectPath.endsWith('/')) objectPath = objectPath.slice(0, (objectPath.length - 1));

        // We're done, return the trimmed object path
        return objectPath;
    }
}
