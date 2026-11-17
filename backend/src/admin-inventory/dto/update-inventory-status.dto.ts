
import { IsIn } from 'class-validator';

export class UpdateInventoryStatusDto {
  @IsIn([
    'AVAILABLE',
    'MAINTENANCE',
    'EXPIRED',
    'SUSPENDED',
    'FAILED',
  ])
  status!: string;
}
