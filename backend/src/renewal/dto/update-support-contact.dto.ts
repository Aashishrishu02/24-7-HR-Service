import {
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateSupportContactDto {
  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== '')
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== '')
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  whatsappUrl?: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== '')
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  instagramUrl?: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== '')
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  facebookUrl?: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== '')
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  youtubeUrl?: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null && value !== '')
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(500)
  telegramUrl?: string;
}
