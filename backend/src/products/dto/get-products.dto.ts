import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class GetProductsDto {
  @IsString() category!: string;

  @IsOptional() @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @IsInt() @Min(1)
  limit?: number = 20;
}
