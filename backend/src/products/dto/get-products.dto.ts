import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min, IsString } from 'class-validator';

export class ListProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 12;

  /**
   * Accepts:
   * - Category UUID (v4)
   * - slug ("fiction", "non-fiction")
   * - case-insensitive title ("Fiction")
   */
  @IsOptional()
  @IsString()
  category?: string;
}
