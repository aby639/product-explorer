import { IsBooleanString, IsOptional, IsUUID } from 'class-validator';

export class GetProductDto {
  @IsUUID() id!: string;

  @IsOptional() @IsBooleanString()
  refresh?: string;
}
