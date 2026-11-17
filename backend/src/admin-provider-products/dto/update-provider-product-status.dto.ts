
import { IsBoolean } from 'class-validator';

export class UpdateProviderProductStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
