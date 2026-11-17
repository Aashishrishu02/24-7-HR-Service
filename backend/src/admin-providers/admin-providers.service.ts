
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  randomBytes,
} from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service.js';
import { CreateProviderDto } from './dto/create-provider.dto.js';
import { UpdateProviderDto } from './dto/update-provider.dto.js';

type CredentialInput = {
  username?: string;
  password?: string;
  apiKey?: string;
  apiSecret?: string;
};

@Injectable()
export class AdminProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private encrypt(value?: string): string | undefined {
    if (value === undefined) return undefined;

    const encodedKey = this.config.get<string>(
      'PROVIDER_ENCRYPTION_KEY',
    );

    if (!encodedKey) {
      throw new InternalServerErrorException(
        'Provider encryption key is not configured',
      );
    }

    const key = Buffer.from(encodedKey, 'base64');

    if (key.length !== 32) {
      throw new InternalServerErrorException(
        'Provider encryption key must decode to 32 bytes',
      );
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return [
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  private encryptCredentials(credentials: CredentialInput) {
    return {
      usernameEncrypted: this.encrypt(credentials.username),
      passwordEncrypted: this.encrypt(credentials.password),
      apiKeyEncrypted: this.encrypt(credentials.apiKey),
      apiSecretEncrypted: this.encrypt(credentials.apiSecret),
    };
  }

  private hasCredentials(credentials: CredentialInput): boolean {
    return Object.values(credentials).some(
      (value) => value !== undefined,
    );
  }

  private safeProvider(provider: any) {
    const credential = provider.credential;

    const { credential: _credential, ...details } = provider;

    return {
      ...details,
      credentialsConfigured: Boolean(credential),
      credentialFields: {
        username: Boolean(credential?.usernameEncrypted),
        password: Boolean(credential?.passwordEncrypted),
        apiKey: Boolean(credential?.apiKeyEncrypted),
        apiSecret: Boolean(credential?.apiSecretEncrypted),
      },
    };
  }

  private readonly providerSelect = {
    id: true,
    name: true,
    code: true,
    baseUrl: true,
    isActive: true,
    apiPurchaseEnabled: true,
    priority: true,
    maxPurchaseAmount: true,
    currency: true,
    createdAt: true,
    updatedAt: true,
    credential: {
      select: {
        usernameEncrypted: true,
        passwordEncrypted: true,
        apiKeyEncrypted: true,
        apiSecretEncrypted: true,
      },
    },
  } as const;

  async findAll() {
    const providers = await this.prisma.provider.findMany({
      select: this.providerSelect,
      orderBy: [
        { priority: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    return {
      providers: providers.map((provider) =>
        this.safeProvider(provider),
      ),
      total: providers.length,
    };
  }

  async findOne(id: string) {
    const provider = await this.prisma.provider.findUnique({
      where: { id },
      select: this.providerSelect,
    });

    if (!provider) {
      throw new NotFoundException('Provider not found');
    }

    return this.safeProvider(provider);
  }

  async create(dto: CreateProviderDto) {
    const {
      username,
      password,
      apiKey,
      apiSecret,
      ...providerData
    } = dto;

    const credentials = {
      username,
      password,
      apiKey,
      apiSecret,
    };

    const encrypted = this.encryptCredentials(credentials);

    try {
      const provider = await this.prisma.provider.create({
        data: {
          ...providerData,
          ...(this.hasCredentials(credentials)
            ? {
                credential: {
                  create: encrypted,
                },
              }
            : {}),
        },
        select: this.providerSelect,
      });

      return this.safeProvider(provider);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(
          'Provider code already exists',
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateProviderDto) {
    await this.findOne(id);

    const {
      username,
      password,
      apiKey,
      apiSecret,
      ...providerData
    } = dto;

    const credentials = {
      username,
      password,
      apiKey,
      apiSecret,
    };

    const suppliedCredentials = Object.fromEntries(
      Object.entries(credentials).filter(
        ([, value]) => value !== undefined,
      ),
    ) as CredentialInput;

    const encrypted = this.encryptCredentials(
      suppliedCredentials,
    );

    try {
      const provider = await this.prisma.provider.update({
        where: { id },
        data: {
          ...providerData,
          ...(this.hasCredentials(suppliedCredentials)
            ? {
                credential: {
                  upsert: {
                    create: encrypted,
                    update: encrypted,
                  },
                },
              }
            : {}),
        },
        select: this.providerSelect,
      });

      return this.safeProvider(provider);
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(
          'Provider code already exists',
        );
      }
      throw error;
    }
  }

  async updateStatus(id: string, isActive: boolean) {
    await this.findOne(id);

    const provider = await this.prisma.provider.update({
      where: { id },
      data: { isActive },
      select: this.providerSelect,
    });

    return this.safeProvider(provider);
  }
}
