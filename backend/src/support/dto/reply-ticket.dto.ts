import { IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { TicketStatus } from '../../generated/prisma/client.js';

export class ReplyTicketDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  message!: string;

  @IsEnum(TicketStatus)
  @IsOptional()
  newStatus?: TicketStatus;
}
