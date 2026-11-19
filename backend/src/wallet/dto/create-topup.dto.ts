import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class CreateTopupDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(100)
  @Max(100000)
  amount: number;
}
