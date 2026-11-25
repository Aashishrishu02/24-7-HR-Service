import { IsEnum, IsNotEmpty } from 'class-validator';
import { TicketStatus } from '../../generated/prisma/client.js';

export class UpdateTicketStatusDto {
  @IsEnum(TicketStatus)
  @IsNotEmpty()
  status!: TicketStatus;
}
