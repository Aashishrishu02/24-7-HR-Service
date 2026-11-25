import { IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { TicketCategory, TicketPriority } from '../../generated/prisma/client.js';

export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  subject!: string;

  @IsEnum(TicketCategory)
  @IsNotEmpty()
  category!: TicketCategory;

  @IsEnum(TicketPriority)
  @IsNotEmpty()
  priority!: TicketPriority;

  @IsString()
  @IsOptional()
  vpsInstanceId?: string;

  @IsString()
  @IsOptional()
  orderId?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  message!: string;
}
